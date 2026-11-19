const Hypercore = require('hypercore')
const ScopeLock = require('scope-lock')
const b4a = require('b4a')
const RefCounter = require('refcounter')
const c = require('compact-encoding')

const toChangesStream = require('../changes-stream.js')
const Sessions = require('../sessions.js')

class BeeSnapshot {
  constructor(snap, onfree) {
    this.refs = 1
    this.snapshot = snap
    this.opened = false
    this.onfree = onfree
  }

  async ready() {
    await this.snapshot.ready()
    this.opened = true
  }

  ref() {
    this.refs++
    return this
  }

  unref() {
    if (--this.refs === 0) {
      this.snapshot.close().then(this.onfree, this.onfree)
      this.snapshot = null
    }
  }

  cork() {}

  uncork() {}

  getIndirectRange(reconstruct, entries, checkout, reqs) {
    const promises = new Array(entries.length)

    for (let i = 0; i < promises.length; i++) {
      const { key, value } = entries[i]
      promises[i] = getWrapped(this.snapshot, key, reconstruct(key, value), checkout, reqs)
    }

    return promises
  }

  getBatch(keys, checkout, reqs) {
    const promises = new Array(keys.length)

    for (let i = 0; i < keys.length; i++) {
      promises[i] = getValue(this.snapshot, keys[i], checkout, reqs)
    }

    return Promise.all(promises)
  }

  get(key, checkout, reqs) {
    return getValue(this.snapshot, key, checkout, reqs)
  }

  createReadStream(range, options) {
    return this.snapshot.createReadStream({ ...range, ...options })
  }
}

module.exports = class Bee2Engine {
  constructor(bee, { trace, key, length = -1 } = {}) {
    this.asap = true
    this.clock = 0
    this.sessions = new Sessions()
    this.trace = trace
    this.snaps = new RefCounter()
    this.db = bee

    if (length > -1) this.db.move({ key, length })

    this.tx = null
    this.lock = new ScopeLock()

    this._freeSnapBound = this.snaps.dec.bind(this.snaps)
  }

  head() {
    return this.db.head()
  }

  get core() {
    return this.db.core
  }

  get closed() {
    return this.db.closed
  }

  ready() {
    return this.db.ready()
  }

  async close() {
    while (!this.snaps.isIdle()) await this.snaps.idle()
    await this.db.close()
  }

  enter() {
    return this.lock.lock()
  }

  exit() {
    this.tx = null
    this.lock.unlock()
  }

  finalize(collection, versions, checkout, tracing, key, value) {
    if (value === null) return null

    const reconstructed = collection.reconstruct(versions.schema, key, value)
    if (this.trace && tracing) this.trace(collection.name, reconstructed, checkout)

    return reconstructed
  }

  batches(snap, versions, definition, options) {
    const collectionsById = new Map()
    for (const c of definition.collections) collectionsById.set(c.id, c)

    snap.ref()

    const stream = toChangesStream(
      snap.snapshot.createChangesStream(options),
      mapBatch.bind(null, versions, collectionsById)
    )

    stream.on('close', () => snap.unref())

    return stream
  }

  diff(snap, versions, collection, from, range, limit) {
    const current = snap.snapshot
    const previous = current.checkout(from)

    snap.ref()

    const stream = toChangesStream(
      previous.createDiffStream(current, { ...range, limit }),
      mapDiff.bind(null, versions, collection)
    )

    stream.on('close', () => {
      previous.close().catch(noop)
      snap.unref()
    })

    return stream
  }

  snapshot(opts) {
    this.snaps.inc()
    return new BeeSnapshot(this.db.snapshot(opts), this._freeSnapBound)
  }

  snapshotFrom(snap, opts) {
    this.snaps.inc()
    return new BeeSnapshot(snap.snapshot.snapshot(opts), this._freeSnapBound)
  }

  checkout(opts) {
    if (opts === -1) return null
    this.snaps.inc()
    return new BeeSnapshot(this.db.checkout(opts), this._freeSnapBound)
  }

  outdated(snap) {
    if (snap === null) return true

    const a = snap.snapshot.head()
    const b = this.db.head()
    if (!a || !b) return true

    if (a.length !== b.length) return true
    return !b4a.equals(a.key, b.key)
  }

  async commit(updates) {
    this.clock++

    let i = 0

    const entries = updates.batch()
    const batch = this.db.write()

    for (; i < entries.length; i++) {
      const [key, value] = entries[i]

      if (value !== null) batch.tryPut(key, value)
      else batch.tryDelete(key)
    }

    await batch.flush()
  }

  download() {
    return this.db.download()
  }

  clearRequests(reqs) {
    Hypercore.destroyRequests(reqs, null)
  }
}

async function getWrapped(db, key, value, checkout, reqs) {
  return { key, value: [value, await getValue(db, value, checkout, reqs)] }
}

async function getValue(db, key, checkout, activeRequests) {
  const source = checkout === -1 || !checkout ? db : db.checkout(checkout)
  try {
    const node = await source.get(key, { checkout, activeRequests })
    return node === null ? null : node.value
  } finally {
    if (source !== db) source.close().catch(noop)
  }
}

// deletes are not part of a bee batch, only the puts are
function mapBatch(versions, collectionsById, { head, tail, batch }) {
  const first = head.length - batch.length
  const inserts = []

  for (let i = 0; i < batch.length; i++) {
    const keys = batch[i].keys
    if (!keys) continue

    for (let j = 0; j < keys.length; j++) {
      const { key, value, valuePointer } = keys[j]
      const id = c.uint.decode({ start: 0, end: key.byteLength, buffer: key })

      const coll = collectionsById.get(id)
      if (coll === undefined) continue

      const val = value || getBatchValue(batch, first, valuePointer)
      if (val === null) continue

      const doc = coll.reconstruct(versions.schema, key, val)
      inserts.push({ collection: coll.name, value: doc })
    }
  }

  return { head, tail, inserts }
}

function getBatchValue(batch, first, ptr) {
  if (!ptr) return null

  const i = ptr.seq - first
  const blk = ptr.core === 0 && !ptr.split && i >= 0 && i < batch.length ? batch[i] : null

  // TODO: bee2 only writes values in the same batch as their key atm, but the format allows
  // pointing elsewhere (and split values). Resolving those should be fixed in the bee2
  // changes stream rather than here.
  if (blk === null || !blk.values || ptr.offset >= blk.values.length) {
    throw new Error('Cannot resolve a value stored outside its batch')
  }

  return blk.values[ptr.offset]
}

function mapDiff(versions, collection, { left, right }) {
  return {
    left: left ? collection.reconstruct(versions.schema, left.key, left.value) : null,
    right: right ? collection.reconstruct(versions.schema, right.key, right.value) : null
  }
}

function noop() {}
