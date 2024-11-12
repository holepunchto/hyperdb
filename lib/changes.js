const { Readable } = require('streamx')

module.exports = class ChangesStream extends Readable {
  constructor (engine, definition) {
    super()

    this.engine = engine
    this.definition = definition
  }

  _open (cb) {
    cb(null)
  }
}
