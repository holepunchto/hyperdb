const IndexStream = require('./lib/stream')
const b4a = require('b4a')

// engines
const RocksEngine = require('./lib/engine/rocks')

class Updates {
  constructor (entries) {
    this.refs = 1
    this.map = new Map(entries)
  }

  get size () {
    return this.map.size
  }

  ref () {
    this.refs++
    return this
  }

  unref () {
    this.refs--
  }

  detach () {
    const entries = new Array(this.map.size)

    let i = 0
    for (const [key, u] of this.map) {
      entries[i++] = [key, { key: u.key, value: u.value, indexes: u.indexes.slice(0) }]
    }

    this.refs--
    return new Updates(entries)
  }

  get (key) {
    const u = this.map.get(b4a.toString(key, 'hex'))
    return u === undefined ? null : u
  }

  clear (key) {
    this.map.clear()
  }

  update (key, value) {
    const u = { key, value, indexes: [] }
    this.map.set(b4a.toString(key, 'hex'), u)
    return u
  }

  entries () {
    return this.map.values()
  }

  overlay (range, index, reverse) {
    const overlay = []

    // 99% of all reads
    if (this.map.size === 0) return overlay

    if (index === null) {
      for (const u of this.map.values()) {
        if (withinRange(range, u.key)) {
          overlay.push({
            key: u.key,
            value: u.value === null ? null : [u.key, u.value]
          })
        }
      }
    } else {
      for (const u of this.map.values()) {
        for (const { key, value } of u.indexes[index.offset]) {
          if (withinRange(range, key)) {
            overlay.push({
              key,
              value: value === null ? null : [u.key, u.value]
            })
          }
        }
      }
    }

    overlay.sort(reverse ? reverseSortOverlay : sortOverlay)
    return overlay
  }
}

class HyperDB {
  constructor (engine, definition, {
    version = definition.version,
    snapshot = engine.snapshot(),
    updates = new Updates([])
  } = {}) {
    this.version = version
    this.engine = engine
    this.definition = definition
    this.updates = updates
    this.closing = null
    this.closed = false

    this._engineSnapshot = snapshot
    this._engineClock = engine.clock

    engine.refs++
  }

  static isDefinition (definition) {
    return !!(definition && typeof definition.resolveCollection === 'function')
  }

  static rocksdb (storage, definition, opts) {
    return new HyperDB(new RocksEngine(storage), definition, opts)
  }

  get updated () {
    return this.updates.size > 0
  }

  ready () {
    return this.engine.ready()
  }

  close () {
    if (this.closing === null) this.closing = this._close()
    return this.closing
  }

  async _close () {
    this.updates.unref()
    this.updates = null

    if (this._engineSnapshot) this._engineSnapshot.unref()
    this._engineSnapshot = null

    if (--this.engine.refs === 0) await this.engine.close()
    this.engine = null
  }

  snapshot () {
    const snapshot = this._engineSnapshot === null
      ? this.engine.snapshot()
      : this._engineSnapshot.ref()

    return new HyperDB(this.engine, this.definition, {
      version: this.version,
      snapshot,
      updates: this.updates.ref()
    })
  }

  find (indexName, query = {}, options) {
    if (options) query = { ...query, ...options }

    maybeClosed(this)

    const index = this.definition.resolveIndex(indexName)
    const collection = index === null
      ? this.definition.resolveCollection(indexName)
      : index.collection

    if (collection === null) throw new Error('Unknown index: ' + indexName)

    const limit = query.limit
    const reverse = !!query.reverse
    const version = query.version === 0 ? 0 : (query.version || this.version)

    const range = index === null
      ? collection.encodeKeyRange(query)
      : index.encodeKeyRange(query)

    const engine = this.engine
    const snap = this._engineSnapshot
    const overlay = this.updates.overlay(range, index, reverse)
    const stream = engine.createReadStream(snap, range, { reverse, limit })

    return new IndexStream(stream, {
      asap: engine.asap,
      decode,
      reverse,
      limit,
      overlay,
      map: index === null ? null : map
    })

    function decode (key, value) {
      return collection.reconstruct(version, key, value)
    }

    function map (entries) {
      return engine.getRange(snap, entries)
    }
  }

  async findOne (indexName, query, options) {
    const stream = this.find(indexName, query, { ...options, limit: 1 })

    let result = null
    for await (const data of stream) result = data
    return result
  }

  async get (collectionName, doc) {
    maybeClosed(this)

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) return null

    const key = collection.encodeKey(doc)
    const u = this.updates.get(key)
    const value = u !== null ? u.value : await this.engine.get(this._engineSnapshot, key)

    return value === null ? null : collection.reconstruct(this.version, key, value)
  }

  async delete (collectionName, doc) {
    maybeClosed(this)

    if (this.updates.refs > 1) this.updates = this.updates.detach()

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) return

    const key = collection.encodeKey(doc)

    const prevValue = await this.engine.get(this._engineSnapshot, key)
    if (prevValue === null) return

    const prevDoc = collection.reconstruct(this.version, key, prevValue)

    const u = this.updates.update(key, null)

    for (let i = 0; i < collection.indexes.length; i++) {
      const idx = collection.indexes[i]
      const prevKey = idx.encodeKey(prevDoc)
      const ups = []

      u.indexes.push(ups)

      if (prevKey !== null) ups.push({ key: prevKey, value: null })
    }
  }

  async insert (collectionName, doc) {
    maybeClosed(this)

    if (this.updates.refs > 1) this.updates = this.updates.detach()

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) throw new Error('Unknown collection: ' + collectionName)

    const key = collection.encodeKey(doc)
    const value = collection.encodeValue(this.version, doc)

    const prevValue = await this.engine.get(this._engineSnapshot, key)
    if (prevValue !== null && b4a.equals(value, prevValue)) return

    const prevDoc = prevValue === null ? null : collection.reconstruct(this.version, key, prevValue)

    const u = this.updates.update(key, value)

    for (let i = 0; i < collection.indexes.length; i++) {
      const idx = collection.indexes[i]
      const prevKey = prevDoc && idx.encodeKey(prevDoc)
      const nextKey = idx.encodeKey(doc)
      const ups = []

      u.indexes.push(ups)

      if (prevKey !== null && b4a.equals(nextKey, prevKey)) continue

      if (prevKey !== null) ups.push({ key: prevKey, value: null })
      if (nextKey !== null) ups.push({ key: nextKey, value: idx.encodeValue(doc) })
    }
  }

  async flush () {
    maybeClosed(this)

    if (this.updates.size === 0) return
    if (this._engineClock !== this.engine.clock) throw new Error('Database has changed, refusing to commit')
    if (this.updates.refs > 1) this.updates = this.updates.detach()

    await this.engine.commit(this.updates)
    this._engineClock = this.engine.clock
    this.updates.clear()

    if (this._engineSnapshot) {
      this._engineSnapshot.unref()
      this._engineSnapshot = this.engine.snapshot()
    }
  }
}

function maybeClosed (db) {
  if (db.closing !== null) throw new Error('Closed')
}

function withinRange (range, key) {
  if (range.gte && b4a.compare(range.gte, key) > 0) return false
  if (range.gt && b4a.compare(range.gt, key) >= 0) return false
  if (range.lte && b4a.compare(range.lte, key) < 0) return false
  if (range.lt && b4a.compare(range.lt, key) <= 0) return false
  return true
}

function sortOverlay (a, b) {
  return b4a.compare(a.key, b.key)
}

function reverseSortOverlay (a, b) {
  return b4a.compare(b.key, a.key)
}

module.exports = HyperDB
