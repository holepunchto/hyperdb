const { Readable, isEnded, getStreamError } = require('streamx')
const b4a = require('b4a')

module.exports = class IndexStream extends Readable {
  constructor (stream, { decode = null, overlay = [], limit = -1, reverse = false, asap = false, map = null }) {
    super()

    this.stream = stream
    this.streamClosed = false
    this.decode = decode
    this.overlay = overlay
    this.overlayIndex = 0
    this.continueDestroy = null
    this.limit = limit
    this.reverse = reverse
    this.asap = asap
    this.map = map
    this.mapping = false
    this.ending = false
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
    cb(null)
  }

  _push (data) {
    if (data.value === null) return
    if (this.limit > 0) this.limit--
    this.push(this.decode === null ? data.value : this.decode(data.value[0], data.value[1]))
  }

  _process (batch, ended) {
    for (let i = 0; i < batch.length && this.limit !== 0; i++) {
      const data = batch[i]

      while (this.limit !== 0) {
        if (this.overlayIndex >= this.overlay.length) {
          this._push(data)
          break
        }

        const cmp = b4a.compare(data.key, this.overlay[this.overlayIndex].key)
        if (this.reverse === true ? cmp > 0 : cmp < 0) {
          this._push(data)
          break
        }

        this._push(this.overlay[this.overlayIndex++])
        if (cmp === 0) break
      }
    }

    if (ended === true) {
      while (this.overlayIndex < this.overlay.length && this.limit !== 0) {
        this._push(this.overlay[this.overlayIndex++])
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

      const promises = entries.length === 0 ? entries : this.map(entries)
      const ended = isEnded(this.stream)

      if (promises.length === 0 && ended === false) break

      try {
        if (this.asap === true && promises.length > 1) {
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

    if (this.map === null) {
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

  async toArray () {
    const list = []
    const stream = this

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
