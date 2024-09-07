const RocksDB = require('rocksdb-native')

module.exports = class RocksEngine {
  constructor (storage) {
    this.asap = false
    this.clock = 0
    this.db = typeof storage === 'object' ? storage : new RocksDB(storage)
  }

  ready () {
    return this.db.ready()
  }

  close () {
    return this.db.close()
  }

  openSnapshot () {
    return this.db.snapshot()
  }

  closeSnapshot (snapshot) {
    snapshot.destroy()
  }

  getRange (snapshot, entries) {
    const read = this.db.read({ snapshot })
    const promises = new Array(entries.length)

    for (let i = 0; i < promises.length; i++) {
      promises[i] = getWrapped(read, entries[i].key, entries[i].value)
    }

    read.tryFlush()
    return promises
  }

  get (snapshot, key) {
    return this.db.get(key, { snapshot })
  }

  createReadStream (snapshot, range, options) {
    return this.db.iterator({ ...range, ...options, snapshot })
  }

  async commit (updates) {
    this.clock++

    const write = this.db.write()

    for (const u of updates.values()) {
      if (u.value !== null) write.put(u.key, u.value)
      else write.delete(u.key)

      for (const ups of u.indexes) {
        for (const { key, value } of ups) {
          if (value !== null) write.put(key, value)
          else write.delete(key)
        }
      }
    }

    await write.flush()
  }
}

async function getWrapped (read, key, value) {
  return { key, value: [value, await read.get(value)] }
}
