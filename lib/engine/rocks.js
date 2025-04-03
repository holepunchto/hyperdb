const RocksDB = require('rocksdb-native')

class RocksSnapshot {
  constructor (snap, clock) {
    this.clock = clock
    this.corks = 0
    this.refs = 1
    this.snapshot = snap
    this.opened = true
    this.batch = null
    this.batches = []
  }

  ready () {
    return this.snapshot.ready()
  }

  ref () {
    this.refs++
    return this
  }

  unref () {
    if (--this.refs === 0) {
      this.snapshot.close().catch(noop)
      for (const b of this.batches) b.destroy()
    }
  }

  cork () {
    this.corks++
    if (this.batch === null) this.batch = this.snapshot.read()
  }

  uncork () {
    if (--this.corks !== 0) return
    if (this.batch !== null) this._flushBackground(this.batch)
    this.batch = null
  }

  // checkout is just here for completeness, not supported in rocks
  getIndirectRange (reconstruct, entries, checkout) {
    const read = this.batches.length > 0 ? this.batches.pop() : this.snapshot.read()
    const promises = new Array(entries.length)

    for (let i = 0; i < promises.length; i++) {
      const { key, value } = entries[i]
      promises[i] = getWrapped(read, key, reconstruct(key, value))
    }

    this._flushBackground(read)
    return promises
  }

  // checkout is just here for completeness, not supported in rocks
  getBatch (keys, checkout) {
    const read = this.batches.length > 0 ? this.batches.pop() : this.snapshot.read()
    const promises = new Array(keys.length)

    for (let i = 0; i < promises.length; i++) {
      promises[i] = read.get(keys[i])
    }

    this._flushBackground(read)
    return Promise.all(promises)
  }

  // checkout is just here for completeness, not supported in rocks
  get (key, checkout) {
    return this.batch === null ? this.snapshot.get(key) : this.batch.get(key)
  }

  createReadStream (range, options) {
    return this.snapshot.iterator({ ...range, ...options })
  }

  async _flushBackground (batch) {
    try {
      await batch.flush()
      this.batches.push(batch)
    } catch (err) {
      batch.destroy()
    }
  }
}

module.exports = class RocksEngine {
  constructor (storage, options) {
    this.asap = false
    this.clock = 0
    this.refs = 0
    this.core = null
    this.db = typeof storage === 'object' ? storage : new RocksDB(storage, options)
    this.db.ready().catch(noop)
    this.write = null
  }

  get closed () {
    return this.db.closed
  }

  ready () {
    return this.db.ready()
  }

  close () {
    if (this.write !== null) this.write.destroy()
    return this.db.close()
  }

  changes () {
    throw new Error('Not supported in Rocks engine')
  }

  snapshot () {
    return new RocksSnapshot(this.db.snapshot(), this.clock)
  }

  outdated (snap) {
    return snap === null || snap.clock !== this.clock
  }

  async commit (updates) {
    this.clock++

    if (this.write === null) this.write = this.db.write()

    const entries = updates.batch()

    for (let i = 0; i < entries.length; i++) {
      const [key, value] = entries[i]

      if (value !== null) this.write.tryPut(key, value)
      else this.write.tryDelete(key)
    }

    await this.write.flush()
  }
}

async function getWrapped (read, key, value) {
  return { key, value: [value, await read.get(value)] }
}

function noop () {}
