const Hypercore = require('hypercore')
const ScopeLock = require('scope-lock')
const b4a = require('b4a')
const RefCounter = require('refcounter')
const { pipeline, Transform } = require('streamx')
const c = require('compact-encoding')
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
    const db = snapshot === null ? this.db : snapshot.snapshot
    const collectionsById = new Map()
    for (const c of definition.collections) collectionsById.set(c.id, c)

    const from = this.db.checkout(range.from)
    const stream = from.createDiffStream(db, range)

    return pipeline(
      stream,
      new Transform({
        transform(value, cb) {
          const insert = !!value.right
          const data = insert ? value.right : value.left

          // @todo what is this? - why double data?
          const prefix = c.uint.decode({ start: 0, end: data.key.byteLength, buffer: data.key })
          if (prefix !== 0) return cb()

          const id = c.uint.decode({ start: 0, end: data.key.byteLength, buffer: data.key })
          const coll = collectionsById.get(id)

          if (insert) {
            const doc = coll.reconstruct(versions.schema, data.key, data.value)
            this.push({ type: 'insert', seq: data.seq, collection: coll.name, value: doc })
          } else {
            const key = coll.reconstructKey(data.key)
            this.push({ type: 'delete', seq: data.seq, collection: coll.name, value: key })
          }

          cb()
        }
      })
    )
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
