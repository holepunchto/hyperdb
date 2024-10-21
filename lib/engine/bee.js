const HyperBee = require('hyperbee')

class BeeSnapshot {
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
      this.snapshot.close().catch(noop)
      this.snapshot = null
    }
  }
}

module.exports = class BeeEngine {
  constructor (core) {
    this.asap = true
    this.clock = 0
    this.refs = 0
    this.db = new HyperBee(core, {
      keyEncoding: 'binary',
      valueEncoding: 'binary'
    })
  }

  get closed () {
    return this.db.closed
  }

  ready () {
    return this.db.ready()
  }

  close () {
    return this.db.close()
  }

  snapshot () {
    return new BeeSnapshot(this.db.snapshot())
  }

  getIndirectRange (snapshot, reconstruct, entries) {
    const db = this._getDB(snapshot)
    const promises = new Array(entries.length)

    for (let i = 0; i < promises.length; i++) {
      const { key, value } = entries[i]
      promises[i] = getWrapped(db, key, reconstruct(key, value))
    }

    return promises
  }

  getBatch (snapshot, keys) {
    const db = this._getDB(snapshot)
    const promises = new Array(keys.length)

    for (let i = 0; i < keys.length; i++) {
      promises[i] = getValue(db, keys[i])
    }

    return Promise.all(promises)
  }

  cork () {}

  uncork () {}

  get (snapshot, key) {
    const db = this._getDB(snapshot)
    return getValue(db, key)
  }

  createReadStream (snapshot, range, options) {
    const db = this._getDB(snapshot)
    return db.createReadStream(range, options)
  }

  async commit (updates) {
    this.clock++

    const batch = this.db.batch()

    for (const u of updates.entries()) {
      if (u.value) await batch.put(u.key, u.value)
      else await batch.del(u.key)

      for (const ups of u.indexes) {
        for (const { key, value } of ups) {
          if (value !== null) await batch.put(key, value)
          else await batch.del(key)
        }
      }
    }

    await batch.flush()
  }

  _getDB (snapshot) {
    return snapshot === null ? this.db : snapshot.snapshot
  }
}

async function getWrapped (db, key, value) {
  return { key, value: [value, await getValue(db, value)] }
}

async function getValue (db, key) {
  const node = await db.get(key)
  return node === null ? null : node.value
}

function noop () {}
