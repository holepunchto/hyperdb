const IndexStream = require('./lib/stream')
const b4a = require('b4a')

// engines
const RocksEngine = require('./lib/engine/rocks')

class HyperDB {
  constructor (engine, definition, { version = definition.version, snapshot = null, updates = new Map() } = {}) {
    this.version = version
    this.engine = engine
    this.engineSnapshot = snapshot
    this.definition = definition
    this.updates = updates
    this.clocked = 0
    this.copyUpdates = false
  }

  static rocksdb (storage, definition) {
    return new HyperDB(new RocksEngine(storage), definition)
  }

  get updated () {
    return this.updates.size > 0
  }

  snapshot () {
    this.copyUpdates = true
    return new HyperDB(this.engine, this.definition, {
      version: this.version,
      snapshot: this.engine.openSnapshot(),
      updates: this.updates
    })
  }

  query (indexName, q = {}, options) {
    if (options) q = { ...q, ...options }

    const index = this.definition.resolveIndex(indexName)
    const collection = index === null ? this.definition.resolveCollection(indexName) : index.collection

    if (collection === null) throw new Error('Unknown index: ' + indexName)

    const limit = q.limit
    const reverse = !!q.reverse
    const version = q.version === 0 ? 0 : (q.version || this.version)

    const range = index === null ? collection.encodeKeyRange(q) : index.encodeKeyRange(q)
    const engine = this.engine
    const engineSnapshot = this.engineSnapshot
    const overlay = []

    if (index === null) {
      for (const u of this.updates.values()) {
        if (withinRange(range, u.key)) overlay.push({ key: u.key, value: u.value === null ? null : [u.key, u.value] })
      }
    } else {
      for (const u of this.updates.values()) {
        for (const { key, value } of u.indexes[index.offset]) {
          if (withinRange(range, key)) overlay.push({ key, value: value === null ? null : [u.key, u.value] })
        }
      }
    }

    overlay.sort(reverse ? reverseSortOverlay : sortOverlay)

    const stream = engine.createReadStream(engineSnapshot, range, { reverse, limit })

    return new IndexStream(stream, { asap: engine.asap, decode, reverse, limit, overlay, map: index === null ? null : map })

    function decode (key, value) {
      return collection.reconstruct(version, key, value)
    }

    function map (entries) {
      return engine.getRange(engineSnapshot, entries)
    }
  }

  async queryOne (indexName, q, options) {
    const stream = this.query(indexName, q, { ...options, limit: 1 })

    let result = null
    for await (const data of stream) result = data
    return result
  }

  async get (collectionName, doc) {
    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) return null

    const key = collection.encodeKey(doc)
    const value = await this._getLatestValue(key)

    return value === null ? null : collection.reconstruct(this.version, key, value)
  }

  _getLatestValue (key) {
    const hex = b4a.toString(key, 'hex')
    const u = this.updates.get(hex)
    if (u) return u.value
    return this.engine.get(this.engineSnapshot, key)
  }

  _copyUpdatesNow () {
    const entries = new Array(this.updates.size)

    let i = 0
    for (const [key, u] of this.updates) {
      entries[i++] = [key, { key: u.key, value: u.value, indexes: u.indexes.slice(0) }]
    }

    this.updated = new Map(entries)
    this.copyUpdates = false
  }

  async delete (collectionName, doc) {
    if (this.copyUpdates === true) this._copyUpdatesNow()

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) return

    const key = collection.encodeKey(doc)

    const prevValue = await this.engine.get(this.engineSnapshot, key)
    if (prevValue === null) return

    const prevDoc = collection.reconstruct(this.version, key, prevValue)

    const u = {
      key,
      value: null,
      indexes: []
    }

    for (let i = 0; i < collection.indexes.length; i++) {
      const idx = collection.indexes[i]
      const prevKey = idx.encodeKey(prevDoc)
      const ups = []

      u.indexes.push(ups)

      if (prevKey !== null) ups.push({ key: prevKey, value: null })
    }

    this.updates.set(b4a.toString(u.key, 'hex'), u)
  }

  async insert (collectionName, doc) {
    if (this.copyUpdates === true) this._copyUpdatesNow()

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) throw new Error('Unknown collection: ' + collectionName)

    const key = collection.encodeKey(doc)
    const value = collection.encodeValue(this.version, doc)

    const prevValue = await this.engine.get(this.engineSnapshot, key)
    if (prevValue !== null && b4a.equals(value, prevValue)) return

    const prevDoc = prevValue === null ? null : collection.reconstruct(this.version, key, prevValue)

    const u = {
      key,
      value,
      indexes: []
    }

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

    this.updates.set(b4a.toString(u.key, 'hex'), u)
  }

  async flush () {
    if (this.copyUpdates === true) this._copyUpdatesNow()
    if (this.clocked !== this.engine.clock) throw new Error('Database has changed, refusing to commit')
    await this.engine.commit(this.updates)
    this.clocked = this.engine.clock
    this.updates.clear()
  }

  async close () {
    await this.engine.close()
  }
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
