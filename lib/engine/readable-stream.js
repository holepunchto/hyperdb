const { getStreamError } = require('streamx')
const { Readable } = require('streamx')

class ReadableStream extends Readable {
  constructor(stream) {
    super()
    this.stream = stream
  }

  _open(cb) {
    this.stream.on('readable', this._ondrain.bind(this))
    this.stream.on('error', noop)
    this.stream.on('close', this._onclose.bind(this))
    cb(null)
  }

  _transform(data) {}

  _ondrain() {
    while (Readable.isBackpressured(this) === false) {
      const data = this.stream.read()
      if (data === null) break

      this._transform(data)
    }
  }

  _onclose() {
    const err = getStreamError(this.stream, { all: true })
    if (err === null) this.push(null)
    else this.destroy(err)
  }

  _read(cb) {
    this._ondrain()
    cb(null)
  }

  _destroy(cb) {
    this.stream.destroy()
    cb(null)
  }
}

module.exports = ReadableStream

function noop() {}
