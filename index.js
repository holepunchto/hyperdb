const IndexStream = require('./lib/stream')
const b4a = require('b4a')

// engines
const RocksEngine = require('./lib/engine/rocks')

class Updates {
  constructor (clock, entries) {
    this.refs = 1
    this.mutating = 0
    this.clock = clock
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
    return new Updates(this.clock, entries)
  }

  get (key) {
    const u = this.map.get(b4a.toString(key, 'hex'))
    return u === undefined ? null : u
  }

  flush (clock) {
    this.clock = clock
    this.map.clear()
  }

  update (key, value) {
    const u = { key, value, indexes: [] }
    this.map.set(b4a.toString(key, 'hex'), u)
    return u
  }

  delete (key) {
    this.map.delete(b4a.toString(key, 'hex'))
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
    updates = new Updates(engine.clock, []),
    rootInstance = null,
    writable = true
  } = {}) {
    this.version = version
    this.engine = engine
    this.engineSnapshot = snapshot
    this.definition = definition
    this.updates = updates
    this.rootInstance = writable === true ? (rootInstance || this) : null
    this.watchers = null
    this.closing = null

    engine.refs++
  }

  static isDefinition (definition) {
    return !!(definition && typeof definition.resolveCollection === 'function')
  }

  static rocks (storage, definition, options) {
    return new HyperDB(new RocksEngine(storage), definition, options)
  }

  static bee (bee, definition, options) {
    throw new Error('TODO')
  }

  get closed () {
    return this.engine === null
  }

  get updated () {
    return this.updates.size > 0
  }

  get writable () {
    return this.rootInstance !== null
  }

  get readable () {
    return this.closing !== null
  }

  ready () {
    return this.engine.ready()
  }

  close () {
    if (this.closing === null) this.closing = this._close()
    return this.closing
  }

  watch (fn) {
    if (this.watchers === null) this.watchers = new Set()
    this.watchers.add(fn)
  }

  unwatch (fn) {
    if (this.watchers === null) return
    this.watchers.delete(fn)
  }

  async _close () {
    this.updates.unref()
    this.updates = null

    if (this.engineSnapshot) this.engineSnapshot.unref()
    this.engineSnapshot = null

    if (--this.engine.refs === 0) await this.engine.close()
    this.engine = null

    this.rootInstance = null
  }

  _createSnapshot (rootInstance, writable) {
    const snapshot = this.engineSnapshot === null
      ? this.engine.snapshot()
      : this.engineSnapshot.ref()

    return new HyperDB(this.engine, this.definition, {
      version: this.version,
      snapshot,
      updates: this.updates.ref(),
      rootInstance,
      writable
    })
  }

  snapshot () {
    return this._createSnapshot(null, false)
  }

  transaction () {
    if (this.rootInstance !== null) {
      throw new Error('Can only make transactions on main instance')
    }

    return this._createSnapshot(this, true)
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
    const snap = this.engineSnapshot
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
    return this.find(indexName, query, { ...options, limit: 1 }).one()
  }

  async get (collectionName, doc) {
    maybeClosed(this)

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) return null

    const key = collection.encodeKey(doc)
    const u = this.updates.get(key)
    const value = u !== null ? u.value : await this.engine.get(this.engineSnapshot, key)

    return value === null ? null : collection.reconstruct(this.version, key, value)
  }

  async delete (collectionName, doc) {
    maybeClosed(this)

    if (this.updates.refs > 1) this.updates = this.updates.detach()

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) return

    const key = collection.encodeKey(doc)

    let prevValue = null
    this.updates.mutating++
    try {
      prevValue = await this.engine.get(this.engineSnapshot, key)
    } finally {
      this.updates.mutating--
    }

    if (prevValue === null) {
      this.updates.delete(key)
      return
    }

    const prevDoc = collection.reconstruct(this.version, key, prevValue)

    const u = this.updates.update(key, null)

    for (let i = 0; i < collection.indexes.length; i++) {
      const idx = collection.indexes[i]
      const del = idx.encodeKeys(prevDoc)
      const ups = []

      u.indexes.push(ups)

      for (let j = 0; j < del.length; j++) ups.push({ key: del[j], value: null })
    }
  }

  async insert (collectionName, doc) {
    maybeClosed(this)

    if (this.updates.refs > 1) this.updates = this.updates.detach()

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) throw new Error('Unknown collection: ' + collectionName)

    const key = collection.encodeKey(doc)
    const value = collection.encodeValue(this.version, doc)

    let prevValue = null
    this.updates.mutating++
    try {
      prevValue = await this.engine.get(this.engineSnapshot, key)
    } finally {
      this.updates.mutating--
    }

    if (prevValue !== null && b4a.equals(value, prevValue)) return

    const prevDoc = prevValue === null ? null : collection.reconstruct(this.version, key, prevValue)

    const u = this.updates.update(key, value)

    for (let i = 0; i < collection.indexes.length; i++) {
      const idx = collection.indexes[i]
      const prevKeys = prevDoc ? idx.encodeKeys(prevDoc) : []
      const nextKeys = idx.encodeKeys(doc)
      const ups = []

      u.indexes.push(ups)

      const [del, put] = diffKeys(prevKeys, nextKeys)
      const value = put.length === 0 ? null : idx.encodeValue(doc)

      for (let j = 0; j < del.length; j++) ups.push({ key: del[j], value: null })
      for (let j = 0; j < put.length; j++) ups.push({ key: put[j], value })
    }
  }

  reload () {
    maybeClosed(this)

    if (this.updates.refs > 1) this.updates = this.updates.detach()
    this.updates.flush(this.engine.clock)

    if (this.engineSnapshot) {
      this.engineSnapshot.unref()
      this.engineSnapshot = this.engine.snapshot()
    }

    if (this.watchers !== null) {
      for (const fn of this.watchers) fn()
    }
  }

  async flush () {
    maybeClosed(this)

    if (this.updating > 0) throw new Error('Insert/delete in progress, refusing to commit')
    if (this.rootInstance === null) throw new Error('Instance is not writable, refusing to commit')
    if (this.updates.size === 0) return
    if (this.updates.clock !== this.engine.clock) throw new Error('Database has changed, refusing to commit')
    if (this.updates.refs > 1) this.updates = this.updates.detach()

    await this.engine.commit(this.updates)

    this.reload()
    if (this.rootInstance !== this) this.rootInstance.reload()
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

function sortKeys (a, b) {
  return b4a.compare(a, b)
}

function sortOverlay (a, b) {
  return b4a.compare(a.key, b.key)
}

function reverseSortOverlay (a, b) {
  return b4a.compare(b.key, a.key)
}

function diffKeys (a, b) {
  if (a.length === 0 || b.length === 0) return [a, b]

  // 90% of all indexes
  if (a.length === 1 && b.length === 1) {
    return b4a.equals(a[0], b[0]) ? [[], []] : [a, b]
  }

  a.sort(sortKeys)
  b.sort(sortKeys)

  const res = [[], []]
  let ai = 0
  let bi = 0

  while (true) {
    if (ai < a.length && bi < b.length) {
      const cmp = b4a.compare(a[bi], b[bi])

      if (cmp === 0) {
        ai++
        bi++
      } else if (cmp < 0) {
        res[0].push(a[ai++])
      } else {
        res[1].push(b[bi++])
      }

      continue
    }

    if (ai < a.length) res[0].push(a[ai++])
    else if (bi < b.length) res[1].push(b[bi++])
    else break
  }

  return res
}

module.exports = HyperDB
