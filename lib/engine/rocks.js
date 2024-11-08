const RocksDB = require('rocksdb-native')

class RocksSnapshot {
  constructor (snap) {
    this.refs = 1
    this.snapshot = snap
  }

  ref () {
    this.refs++
    return this
  }

  unref () {
    if (--this.refs === 0) {
      this.snapshot.destroy()
      this.snapshot = null
    }
  }
}

module.exports = class RocksEngine {
  constructor (storage) {
    this.asap = false
    this.clock = 0
    this.refs = 0
    this.batch = null
    this.db = typeof storage === 'object' ? storage : new RocksDB(storage)
    this.db.ready().catch(noop)
  }

  get closed () {
    return this.db.closed
  }

  ready () {
    return this.db.ready()
  }

  close () {
    if (this.batch !== null) this.batch.destroy()
    return this.db.close()
  }

  snapshot () {
    return new RocksSnapshot(this.db.snapshot())
  }

  getIndirectRange (snapshot, reconstruct, entries) {
    const read = this.db.read({ snapshot: getSnapshot(snapshot) })
    const promises = new Array(entries.length)

    for (let i = 0; i < promises.length; i++) {
      const { key, value } = entries[i]
      promises[i] = getWrapped(read, key, reconstruct(key, value))
    }

    read.tryFlush()
    return promises
  }

  getBatch (snapshot, keys) {
    const read = this.db.read({ snapshot: getSnapshot(snapshot) })
    const promises = new Array(keys.length)

    for (let i = 0; i < promises.length; i++) {
      promises[i] = read.get(keys[i])
    }

    read.tryFlush()
    return Promise.all(promises)
  }

  cork () {
    if (this.batch !== null) return
    this.batch = this.db.read()
  }

  uncork () {
    if (this.batch !== null) this.batch.tryFlush()
    this.batch = null
  }

  get (snapshot, key) {
    const options = { snapshot: getSnapshot(snapshot) }
    return this.batch === null ? this.db.get(key, options) : this.batch.get(key, options)
  }

  createReadStream (snapshot, range, options) {
    return this.db.iterator({ ...range, ...options, snapshot: getSnapshot(snapshot) })
  }

  async commit (updates) {
    this.clock++

    const write = this.db.write()

    for (const u of updates.entries()) {
      if (u.value !== null) write.tryPut(u.key, u.value)
      else write.tryDelete(u.key)

      for (const ups of u.indexes) {
        for (const { key, value } of ups) {
          if (value !== null) write.tryPut(key, value)
          else write.tryDelete(key)
        }
      }
    }

    await write.flush()
  }
}

async function getWrapped (read, key, value) {
  return { key, value: [value, await read.get(value)] }
}

function getSnapshot (snap) {
  return snap === null ? null : snap.snapshot
}

function noop () {}
