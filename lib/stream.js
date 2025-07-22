const { Readable, isEnded, getStreamError } = require('streamx')
const b4a = require('b4a')

module.exports = class IndexStream extends Readable {
  constructor (db, range, { index = null, collection = index.collection, reverse = false, limit = -1, overlay = [], checkout = 0 }) {
    super()

    this.version = db.version
    this.engine = db.engine
    this.snapshot = db.engineSnapshot
    this.activeRequests = db.activeRequests
    this.traceable = db.traceable
    this.collection = collection
    this.index = index
    this.stream = this.snapshot.createReadStream(range, { reverse, limit, checkout, activeRequests: this.activeRequests })
    this.streamClosed = false
    this.overlay = overlay
    this.overlayIndex = 0
    this.continueDestroy = null
    this.limit = limit
    this.reverse = reverse
    this.mapping = false
    this.ending = false
    this.checkout = checkout

    this.snapshot.ref()
  }

  _open (cb) {
    const destroy = this.destroy.bind(this)
    const drain = this._drain.bind(this)
    const onclose = this._onclose.bind(this)

    this.stream.on('readable', drain)
    this.stream.on('end', drain)

    this.stream.on('error', destroy)
    this.stream.on('close', onclose)

    cb(null)
  }

  _onclose () {
    this.streamClosed = true
    if (isEnded(this.stream) === false) this.destroy()
    this._continueDestroyMaybe()
  }

  _continueDestroyMaybe () {
    if (this.mapping === true) return
    if (this.streamClosed === false) return
    if (this.continueDestroy === null) return

    const cb = this.continueDestroy
    this.continueDestroy = null
    this.snapshot.unref()
    cb(null)
  }

  _push (value) {
    if (value === null) return
    if (this.limit > 0) this.limit--
    this.push(this.engine.finalize(this.collection, this.version, this.checkout, this.traceable, value[0], value[1]))
  }

  _process (batch, ended) {
    for (let i = 0; i < batch.length && this.limit !== 0; i++) {
      const data = batch[i]

      while (this.limit !== 0) {
        if (this.overlayIndex >= this.overlay.length) {
          this._push(data.value)
          break
        }

        const cmp = b4a.compare(data.key, this.overlay[this.overlayIndex].key)
        if (this.reverse === true ? cmp > 0 : cmp < 0) {
          this._push(data.value)
          break
        }

        this._push(this.overlay[this.overlayIndex++].value)
        if (cmp === 0) break
      }
    }

    if (ended === true) {
      while (this.overlayIndex < this.overlay.length && this.limit !== 0) {
        this._push(this.overlay[this.overlayIndex++].value)
      }

      this.push(null)
      this.ending = true
    }
  }

  async _processAsap (promises, ended) {
    for (let i = 1; i < promises.length; i++) promises[i].catch(noop) // promises are handled

    for (let i = 0; i < promises.length; i++) {
      const batch = [await promises[i]]
      if (this.destroying === true) return
      this._process(batch, (i === promises.length - 1) && ended)
    }
  }

  async _mapAndProcess () {
    this.mapping = true

    while (!Readable.isBackpressured(this) && this.destroying === false) {
      const entries = fullyDrain(this.stream)

      const promises = entries.length === 0 ? entries : this.snapshot.getIndirectRange(this.index.reconstruct, entries, this.checkout, this.activeRequests)
      const ended = isEnded(this.stream)

      if (promises.length === 0 && ended === false) break

      try {
        if (this.engine.asap === true && promises.length > 1) {
          await this._processAsap(promises, ended)
        } else {
          const batch = await Promise.all(promises)
          if (this.destroying === false) this._process(batch, ended)
        }
      } catch (err) {
        await Promise.allSettled(promises)
        this.destroy(err)
      }
    }

    this.mapping = false
    this._continueDestroyMaybe()
  }

  _drain () {
    if (Readable.isBackpressured(this)) return

    if (this.index === null) {
      this._process(fullyDrainMapped(this.stream), isEnded(this.stream))
    } else if (this.mapping === false) {
      this._mapAndProcess()
    }
  }

  _read (cb) {
    this._drain()
    cb(null)
  }

  _predestroy () {
    this.stream.destroy()
  }

  _destroy (cb) {
    this.stream.destroy()
    this.continueDestroy = cb
    this._continueDestroyMaybe()
  }

  one () {
    const stream = this
    let last = null

    return new Promise(function (resolve, reject) {
      stream.on('error', noop)
      stream.on('readable', onreadable)
      stream.on('close', onclose)

      function onreadable () {
        while (true) {
          const data = stream.read()
          if (data === null) return
          last = data
        }
      }

      function onclose () {
        if (isEnded(stream)) resolve(last)
        else reject(getStreamError(stream, { all: true }))
      }
    })
  }

  async toArray () {
    const stream = this
    const list = []

    return new Promise(function (resolve, reject) {
      stream.on('error', noop)
      stream.on('readable', onreadable)
      stream.on('close', onclose)

      function onreadable () {
        while (true) {
          const data = stream.read()
          if (data === null) return
          list.push(data)
        }
      }

      function onclose () {
        if (isEnded(stream)) resolve(list)
        else reject(getStreamError(stream, { all: true }))
      }
    })
  }
}

function fullyDrainMapped (stream) {
  const batch = []

  while (true) {
    const data = stream.read()
    if (data === null) return batch
    batch.push({ key: data.key, value: [data.key, data.value] })
  }
}

function fullyDrain (stream) {
  const batch = []

  while (true) {
    const data = stream.read()
    if (data === null) return batch
    batch.push(data)
  }
}

function noop () {}
