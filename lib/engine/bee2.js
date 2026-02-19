const HyperBee2 = require('hyperbee2')
const Hypercore = require('hypercore')
const ScopeLock = require('scope-lock')
const { Readable, getStreamError } = require('streamx')
const c = require('compact-encoding')
const b4a = require('b4a')
const RefCounter = require('refcounter')
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

// class ChangesStream extends Readable {
//   constructor(db, versions, definition, range) {
//     super()

//     this.db = db
//     this.versions = versions
//     this.definition = definition
//     this.stream = null
//     this.collectionsById = new Map()
//     this.range = range

//     for (const c of this.definition.collections) this.collectionsById.set(c.id, c)
//   }

//   _open(cb) {
//     this.stream = this.db.createHistoryStream(this.range)
//     this.stream.on('readable', this._ondrain.bind(this))
//     this.stream.on('error', noop)
//     this.stream.on('close', this._onclose.bind(this))
//     cb(null)
//   }

//   _ondrain() {
//     while (Readable.isBackpressured(this) === false) {
//       const data = this.stream.read()

//       if (data === null) break

//       const id = c.uint.decode({ start: 0, end: data.key.byteLength, buffer: data.key })
//       const coll = this.collectionsById.get(id)
//       if (coll === undefined) continue

//       if (data.type === 'put') {
//         const doc = coll.reconstruct(this.versions.schema, data.key, data.value)
//         this.push({ type: 'insert', seq: data.seq, collection: coll.name, value: doc })
//       } else {
//         const key = coll.reconstructKey(data.key)
//         this.push({ type: 'delete', seq: data.seq, collection: coll.name, value: key })
//       }
//     }
//   }

//   _onclose() {
//     const err = getStreamError(this.stream, { all: true })
//     if (err === null) this.push(null)
//     else this.destroy(err)
//   }

//   _read(cb) {
//     this._ondrain()
//     cb(null)
//   }

//   _destroy(cb) {
//     this.stream.destroy()
//     cb(null)
//   }
// }

module.exports = class Bee2Engine {
  constructor(store, { trace, key, length = -1 } = {}) {
    this.asap = true
    this.clock = 0
    this.store = store
    this.sessions = new Sessions()
    this.trace = trace
    this.snaps = new RefCounter()
    this.db = new HyperBee2(store, { key })

    if (length > -1) this.db.move({ key, length })

    this.tx = null
    this.lock = new ScopeLock()

    this._freeSnapBound = this.snaps.dec.bind(this.snaps)
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

  changes(snapshot, versions, definition, range) {
    throw new Error('Not yet supported for bee2')
    // const db = snapshot === null ? this.db : snapshot.snapshot
    // return new ChangesStream(db, versions, definition, range)
  }

  snapshot() {
    this.snaps.inc()
    return new BeeSnapshot(this.db.snapshot(), this._freeSnapBound)
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

  clearRequests(reqs) {
    if (!reqs.length) return
    Hypercore.clearRequests(reqs, null)
  }
}

async function getWrapped(db, key, value, checkout, reqs) {
  return { key, value: [value, await getValue(db, value, checkout, reqs)] }
}

async function getValue(db, key, checkout, activeRequests) {
  const node = await db.get(key, { checkout, activeRequests })
  return node === null ? null : node.value
}

function noop() {}
