const HyperBee = require('hyperbee2')
const ScopeLock = require('scope-lock')
const c = require('compact-encoding')
const RefCounter = require('refcounter')
const Sessions = require('../sessions.js')

class BeeSnapshot {
  constructor (snap, onfree) {
    this.refs = 1
    this.snapshot = snap
    this.opened = false
    this.onfree = onfree
  }

  async ready () {
    await this.snapshot.ready()
    this.opened = true
  }

  ref () {
    this.refs++
    return this
  }

  unref () {
    if (--this.refs === 0) {
      this.snapshot.close().then(this.onfree, this.onfree)
      this.snapshot = null
    }
  }

  cork () {}

  uncork () {}

  getIndirectRange (reconstruct, entries, checkout, reqs) {
    const promises = new Array(entries.length)

    for (let i = 0; i < promises.length; i++) {
      const { key, value } = entries[i]
      promises[i] = getWrapped(this.snapshot, key, reconstruct(key, value), checkout, reqs)
    }

    return promises
  }

  getBatch (keys, checkout, reqs) {
    const promises = new Array(keys.length)

    for (let i = 0; i < keys.length; i++) {
      promises[i] = getValue(this.snapshot, keys[i], checkout, reqs)
    }

    return Promise.all(promises)
  }

  get (key, checkout, reqs) {
    return getValue(this.snapshot, key, checkout, reqs)
  }

  createReadStream (range, options) {
    return this.snapshot.createReadStream({ ...range, ...options })
  }
}

module.exports = class BeeEngine {
  constructor (store, { trace } = {}) {
    this.asap = true
    this.clock = 0
    this.sessions = new Sessions()
    this.trace = trace
    this.snaps = new RefCounter()
    this.db = new HyperBee(store)
    this.core = this.db.core

    this.tx = null
    this.lock = new ScopeLock()

    this._freeSnapBound = this.snaps.dec.bind(this.snaps)
  }

  get closed () {
    return this.db.closed
  }

  ready () {
    return this.db.ready()
  }

  async close () {
    while (!this.snaps.isIdle()) await this.snaps.idle()
    await this.db.close()
  }

  enter () {
    return this.lock.lock()
  }

  exit () {
    this.tx = null
    this.lock.unlock()
  }

  finalize (collection, version, checkout, tracing, key, value) {
    if (value === null) return null

    const reconstructed = collection.reconstruct(version, key, value)
    if (this.trace && tracing) this.trace(collection.name, reconstructed, checkout)

    return reconstructed
  }

  changes (snapshot, version, definition, range) {
    throw new Error('Not supported in Bee2 engine (yet)')
  }

  snapshot () {
    this.snaps.inc()
    return new BeeSnapshot(this.db.snapshot(), this._freeSnapBound)
  }

  outdated (snap) {
    const head = snap && snap.snapshot.head()
    return head === null || snap === null || head.length !== this.core.length || !this.core.key.equals(head.key)
  }

  async commit (updates) {
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

  clearRequests (reqs) {
    if (!reqs.length) return
    this.core.core.replicator.clearRequests(reqs, null)
  }
}

async function getWrapped (db, key, value, checkout, reqs) {
  return { key, value: [value, await getValue(db, value, checkout, reqs)] }
}

async function getValue (db, key, checkout, activeRequests) {
  const node = await db.get(key, { checkout, activeRequests })
  return node === null ? null : node.value
}

function noop () {}
