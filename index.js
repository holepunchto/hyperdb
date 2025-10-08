const IndexStream = require('./lib/stream.js')
const b4a = require('b4a')

// engines
const RocksEngine = require('./lib/engine/rocks.js')
const BeeEngine = require('./lib/engine/bee.js')

let compareHasDups = false

class Updates {
  constructor (tick, entries) {
    this.refs = 1
    this.mutating = 0
    this.tick = tick // internal tie breaker clock for same key updates
    this.map = new Map(entries)
    this.locks = new Map()
  }

  get size () {
    return this.map.size
  }

  enter (collection) {
    if (collection.trigger !== null) {
      if (this.locks.has(collection.id)) return false
      this.locks.set(collection.id, { resolve: null, promise: null })
    }

    this.mutating++
    return true
  }

  exit (collection) {
    this.mutating--
    if (collection.trigger === null) return
    const { resolve } = this.locks.get(collection.id)
    this.locks.delete(collection.id)
    if (resolve) resolve()
  }

  wait (collection) {
    const state = this.locks.get(collection.id)
    if (state.promise) return state.promise
    state.promise = new Promise((resolve) => { state.resolve = resolve })
    return state.promise
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

    if (entries.length > 0) {
      let i = 0
      for (const [key, u] of this.map) {
        const clone = {
          created: u.created,
          tick: u.tick,
          collection: u.collection,
          key: u.key,
          value: u.value,
          indexes: u.indexes.slice(0)
        }
        entries[i++] = [key, clone]
      }
    }

    this.refs--
    return new Updates(this.tick, entries)
  }

  get (key) {
    const u = this.map.get(b4a.toString(key, 'hex'))
    return u === undefined ? null : u
  }

  getIndex (index, key) {
    // 99% of all reads
    if (this.map.size === 0 || index.offset === -1) return null

    const matches = []

    for (const u of this.map.values()) {
      if (u.collection.id !== index.collection.id) continue

      const ups = u.indexes[index.offset]

      for (let i = 0; i < ups.length; i++) {
        if (b4a.equals(key, ups[i].key)) matches.push(u)
      }
    }

    if (!matches.length) return null

    let latest = matches[0]

    for (let i = 1; i < matches.length; i++) {
      const m = matches[i]
      if (m.tick > latest.tick) latest = m
    }

    return latest
  }

  flush () {
    this.map.clear()
  }

  update (collection, key, value) {
    const u = {
      created: false,
      tick: this.tick++,
      collection,
      key,
      value,
      indexes: []
    }
    this.map.set(b4a.toString(key, 'hex'), u)
    return u
  }

  delete (key) {
    this.map.delete(b4a.toString(key, 'hex'))
  }

  batch () {
    const ordered = new Array(this.map.size)

    let sort = false
    let i = 0

    for (const u of this.map.values()) {
      if (i > 0 && u.tick < ordered[i - 1].tick) sort = true
      ordered[i++] = u
    }

    if (sort) ordered.sort(sortUpdates)

    const dedup = ordered.length > 1 ? new Set() : null
    const batch = []

    for (let i = ordered.length - 1; i >= 0; i--) {
      const u = ordered[i]

      for (let j = 0; j < u.indexes.length; j++) {
        const idx = u.indexes[j]

        // TODO: we can be more fancy here with only deduping non-unique indexes
        for (let k = 0; k < idx.length; k++) {
          const { key, value } = idx[k]
          if (dedup !== null) {
            const id = b4a.toString(key, 'hex')
            if (dedup.has(id)) continue
            dedup.add(id)
          }

          batch.push([key, value])
        }
      }

      // these keys are guaranteed unique so no dedup is needed
      batch.push([u.key, u.value])
    }

    return batch
  }

  collectionOverlay (collection, range, reverse) {
    const overlay = []

    // 99% of all reads
    if (this.map.size === 0) return overlay

    for (const u of this.map.values()) {
      if (u.collection.id !== collection.id) continue
      if (withinRange(range, u.key)) {
        overlay.push({
          tick: u.tick,
          key: u.key,
          value: u.value === null ? null : [u.key, u.value]
        })
      }
    }

    return sortOverlay(overlay, reverse)
  }

  indexOverlay (index, range, reverse) {
    const overlay = []

    // 99% of all reads
    if (this.map.size === 0 || index.offset === -1) return overlay

    const collection = index.collection

    for (const u of this.map.values()) {
      if (u.collection.id !== collection.id) continue
      for (const { key, value } of u.indexes[index.offset]) {
        if (withinRange(range, key)) {
          overlay.push({
            tick: u.tick,
            key,
            value: value === null ? null : [u.key, u.value]
          })
        }
      }
    }

    return sortOverlay(overlay, reverse)
  }
}

class HyperDB {
  constructor (engine, definition, {
    version = definition.version,
    snapshot = engine.snapshot(),
    updates = new Updates(0, []),
    rootInstance = null,
    writable = true,
    context = null
  } = {}) {
    this.version = version
    this.context = context
    this.index = 0 // for the session
    this.engine = engine
    this.engineSnapshot = snapshot
    this.definition = definition
    this.updates = updates
    this.rootInstance = writable === true ? (rootInstance || this) : null
    this.watchers = null
    this.closing = null
    this.activeRequests = []

    this.engine.sessions.add(this)
  }

  static isDefinition (definition) {
    return !!(definition && typeof definition.resolveCollection === 'function')
  }

  static rocks (storage, definition, options = {}) {
    const readOnly = options.readOnly === true || options.readonly === true
    const trace = options.trace || null
    return new HyperDB(new RocksEngine(storage, { readOnly, trace }), definition, options)
  }

  static bee (core, definition, options = {}) {
    const extension = options.extension
    const autoUpdate = !!options.autoUpdate
    const trace = options.trace || null

    const db = new HyperDB(new BeeEngine(core, { extension, trace }), definition, options)

    if (autoUpdate) {
      const update = db.update.bind(db)
      core.on('append', update)
      core.on('truncate', update)
    }

    return db
  }

  get core () {
    return this.engine.core
  }

  get db () {
    return this.engine.db
  }

  get closed () {
    return this.engine === null
  }

  get writable () {
    return this.rootInstance !== null
  }

  get traceable () {
    // basically, are we not a write tx
    return this.rootInstance === this || this.rootInstance === null
  }

  get readable () {
    return this.closing !== null
  }

  get autoClose () {
    return this.rootInstance !== null && this.rootInstance !== this
  }

  setDefinition (definition) {
    this.version = definition.version
    this.definition = definition
  }

  cork () {
    if (this.engineSnapshot !== null) this.engineSnapshot.cork()
  }

  uncork () {
    if (this.engineSnapshot !== null) this.engineSnapshot.uncork()
  }

  ready () {
    return this.engineSnapshot === null ? Promise.resolve() : this.engineSnapshot.ready()
  }

  close () {
    if (this.closing === null) this.closing = this._close()
    return this.closing
  }

  changes (range = {}) {
    maybeClosed(this)

    return this.engine.changes(range.live ? null : this.engineSnapshot, this.version, this.definition, range)
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
    this.engine.clearRequests(this.activeRequests)

    this.updates.unref()
    this.updates = null

    this.engineSnapshot.unref()
    this.engineSnapshot = null

    // if root, close all
    if (this.rootInstance === this) {
      await this.engine.sessions.close(this)
    }

    this.engine.sessions.remove(this)

    if (this.engine.tx === this) this.engine.exit()
    if (this.engine.sessions.size === 0) await this.engine.close()

    this.engine = null
  }

  _createSnapshot (rootInstance, writable, context) {
    const snapshot = this.engineSnapshot.ref()

    return new HyperDB(this.engine, this.definition, {
      version: this.version,
      snapshot,
      updates: this.updates.ref(),
      rootInstance,
      writable,
      context
    })
  }

  snapshot (options) {
    maybeClosed(this)

    const context = (options && options.context) || this.context
    return this._createSnapshot(this, false, context)
  }

  // in future major, lets move transaction to be exclusive (aka sync) always
  async exclusiveTransaction (options) {
    await this.engine.enter()

    if (this.closing) {
      this.engine.exit()
      maybeClosed(this)
    }

    this.engine.tx = this.transaction(options)
    return this.engine.tx
  }

  transaction (options) {
    maybeClosed(this)

    if (this.rootInstance !== this) {
      throw new Error('Can only make transactions on main instance')
    }

    const context = (options && options.context) || this.context
    const tx = this._createSnapshot(this, true, context)

    tx.update()

    return tx
  }

  find (indexName, query = {}, options) {
    if (options) query = { ...query, ...options }

    maybeClosed(this)

    const index = this.definition.resolveIndex(indexName)
    const collection = index === null
      ? this.definition.resolveCollection(indexName)
      : index.collection

    if (collection === null) throw new Error('Unknown index: ' + indexName)

    const {
      checkout = -1,
      limit,
      reverse = false
    } = query

    const range = index === null
      ? collection.encodeKeyRange(query)
      : index.encodeKeyRange(query)

    const overlay = checkout !== -1
      ? []
      : index === null
        ? this.updates.collectionOverlay(collection, range, reverse)
        : this.updates.indexOverlay(index, range, reverse)

    return new IndexStream(this, range, {
      index,
      collection,
      reverse,
      limit,
      overlay,
      checkout
    })
  }

  async findOne (indexName, query, options) {
    return this.find(indexName, query, { ...options, limit: 1 }).one()
  }

  updated (collectionName, doc) {
    if (this.updates === null) return false
    if (!collectionName) return this.updates.size > 0

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) return false

    const key = b4a.isBuffer(doc) ? doc : collection.encodeKey(doc)
    const u = this.updates.get(key)
    return u !== null
  }

  async get (collectionName, doc, { checkout = -1 } = {}) {
    maybeClosed(this)

    const snap = this.engineSnapshot.ref()

    try {
      const collection = this.definition.resolveCollection(collectionName)
      if (collection !== null) return await this._getCollection(collection, snap, doc, checkout)

      const index = this.definition.resolveIndex(collectionName)
      if (index === null) throw new Error('Unknown index or collection: ' + collectionName)

      const key = index.encodeKey(doc, this.context)
      if (key === null) return null

      const u = this.updates.getIndex(index, key)
      if (u !== null && checkout === -1) return u.value === null ? null : index.collection.reconstruct(this.version, u.key, u.value)

      const value = await snap.get(key, checkout, this.activeRequests)
      if (value === null) return null

      return this._getCollection(index.collection, snap, index.reconstruct(key, value), checkout)
    } finally {
      if (snap !== null) snap.unref()
    }
  }

  async _getCollection (collection, snap, doc, checkout) {
    maybeClosed(this)

    // we allow passing the raw primary key here cause thats what the trigger passes for simplicity
    // you shouldnt rely on that.
    const key = b4a.isBuffer(doc) ? doc : collection.encodeKey(doc)

    const u = this.updates.get(key)
    const value = (u !== null && checkout === -1) ? u.value : await snap.get(key, checkout, this.activeRequests)

    // check again now cause we did async work above to engine might be nulled out
    maybeClosed(this)

    return this.engine.finalize(collection, this.version, checkout, this.traceable, key, value)
  }

  // TODO: needs to wait for pending inserts/deletes and then lock all future ones whilst it runs
  _runTrigger (collection, key, doc) {
    return collection.trigger(this, key, doc, this.context)
  }

  async delete (collectionName, doc) {
    maybeClosed(this)

    if (this.updates.refs > 1) this.updates = this.updates.detach()

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) return

    while (this.updates.enter(collection) === false) await this.updates.wait(collection)

    const snap = this.engineSnapshot.ref()
    const key = collection.encodeKey(doc)

    let prevValue = null

    try {
      prevValue = await this.engineSnapshot.get(key, -1, this.activeRequests)
      if (collection.trigger !== null) await this._runTrigger(collection, doc, null)

      if (prevValue === null) {
        this.updates.delete(key)
        return
      }

      const prevDoc = collection.reconstruct(this.version, key, prevValue)

      const u = this.updates.update(collection, key, null)

      for (let i = 0; i < collection.indexes.length; i++) {
        const idx = collection.indexes[i]
        const del = idx.encodeIndexKeys(prevDoc, this.context)
        const ups = []

        u.indexes.push(ups)

        for (let j = 0; j < del.length; j++) ups.push({ key: del[j], value: null })
      }
    } finally {
      snap.unref()
      this.updates.exit(collection)
    }
  }

  async insert (collectionName, doc, { force = false } = {}) {
    maybeClosed(this)

    if (this.updates.refs > 1) this.updates = this.updates.detach()

    const collection = this.definition.resolveCollection(collectionName)
    if (collection === null) throw new Error('Unknown collection: ' + collectionName)

    while (this.updates.enter(collection) === false) await this.updates.wait(collection)

    const snap = this.engineSnapshot.ref()
    const key = collection.encodeKey(doc)
    const value = collection.encodeValue(this.version, doc)

    let prevValue = null

    try {
      prevValue = await this.engineSnapshot.get(key, -1, this.activeRequests)
      if (collection.trigger !== null) await this._runTrigger(collection, doc, doc)

      if (!force && prevValue !== null && b4a.equals(value, prevValue)) {
        this.updates.delete(key)
        return
      }

      const prevDoc = prevValue === null ? null : collection.reconstruct(this.version, key, prevValue)

      const u = this.updates.update(collection, key, value)

      u.created = prevValue === null

      for (let i = 0; i < collection.indexes.length; i++) {
        const idx = collection.indexes[i]
        const prevKeys = prevDoc ? idx.encodeIndexKeys(prevDoc, this.context) : []
        const nextKeys = idx.encodeIndexKeys(doc, this.context)
        const ups = []

        u.indexes.push(ups)

        const [del, put] = diffKeys(prevKeys, nextKeys, force)
        const value = put.length === 0 ? null : idx.encodeValue(doc)

        for (let j = 0; j < del.length; j++) ups.push({ key: del[j], value: null })
        for (let j = 0; j < put.length; j++) ups.push({ key: put[j], value })
      }
    } finally {
      snap.unref()
      this.updates.exit(collection)
    }
  }

  update () {
    maybeClosed(this)

    if (!this.engine.outdated(this.engineSnapshot)) return

    if (this.updates.refs > 1) this.updates = this.updates.detach()
    this.updates.flush()

    this.engineSnapshot.unref()
    this.engineSnapshot = this.engine.snapshot()

    if (this.watchers !== null) {
      for (const fn of this.watchers) fn()
    }
  }

  async _flush () {
    if (this.engine.outdated(this.engineSnapshot)) throw new Error('Database has changed, refusing to commit')
    if (this.updates.refs > 1) this.updates = this.updates.detach()

    await this.engine.commit(this.updates)

    this.update()

    if (this.rootInstance !== this && this.rootInstance.updates.size === 0) this.rootInstance.update()
  }

  async flush () {
    maybeClosed(this)

    if (this.engineSnapshot.opened === false) await this.engineSnapshot.ready()

    if (this.updating > 0) throw new Error('Insert/delete in progress, refusing to commit')
    if (this.rootInstance === null) throw new Error('Instance is not writable, refusing to commit')
    if (this.updates.size > 0) await this._flush()
    if (this.autoClose === true) await this.close()
  }
}

function maybeClosed (db) {
  if (db.closing !== null) throw new Error('Hyperdb is closed')
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

function sortUpdates (a, b) {
  return a.tick - b.tick // oldest to newest
}

function compareOverlay (a, b) {
  const c = b4a.compare(a.key, b.key)
  if (c !== 0) return c
  compareHasDups = true
  return b.tick - a.tick
}

function reverseCompareOverlay (a, b) {
  const c = b4a.compare(b.key, a.key)
  if (c !== 0) return c
  compareHasDups = true
  return b.tick - a.tick
}

function diffKeys (a, b, force) {
  if (a.length === 0 || b.length === 0) return [a, b]

  // 90% of all indexes
  if (a.length === 1 && b.length === 1) {
    return b4a.equals(a[0], b[0]) ? (force ? [[], b] : [[], []]) : [a, b]
  }

  a.sort(sortKeys)
  b.sort(sortKeys)

  const res = [[], []]
  let ai = 0
  let bi = 0

  while (true) {
    if (ai < a.length && bi < b.length) {
      const cmp = b4a.compare(a[ai], b[bi])

      if (cmp === 0) {
        if (force) res[1].push(b[bi])
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

function stripDups (overlay) {
  let j = 0

  for (let i = 0; i < overlay.length; i++) {
    const a = overlay[i]
    overlay[j++] = a
    while (i + 1 < overlay.length && b4a.equals(a.key, overlay[i + 1].key)) i++
  }

  overlay.length = j
}

function sortOverlay (overlay, reverse) {
  compareHasDups = false
  overlay.sort(reverse ? reverseCompareOverlay : compareOverlay)
  if (compareHasDups === true) stripDups(overlay)
  return overlay
}

module.exports = HyperDB
