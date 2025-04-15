const { encode, decode } = require('../spec/hyperschema')

const encodeMessage = (obj) => encode('@hyperdb-extension/message', obj)
const decodeMessage = (buf) => decode('@hyperdb-extension/message', buf)

const MESSAGE_TYPE = {
  GET: 1,
  CACHE: 2
}

const FLUSH_BATCH = 128

class Batch {
  constructor (outgoing, from) {
    this.blocks = []
    this.start = 0
    this.end = 0
    this.outgoing = outgoing
    this.from = from
  }

  push (seq) {
    const len = this.blocks.push(seq)
    if (len === 1 || seq < this.start) this.start = seq
    if (len === 1 || seq >= this.end) this.end = seq + 1
    if (len >= FLUSH_BATCH) {
      this.send()
      this.clear()
    }
  }

  send () {
    if (!this.blocks.length) return
    this.outgoing.send(encodeMessage({ type: MESSAGE_TYPE.CACHE, blocks: this.blocks, start: this.start, end: this.end }), this.from)
  }

  clear () {
    this.start = this.end = 0
    this.blocks = []
  }
}

class HyperDBExtension {
  constructor (db) {
    this.encoding = null
    this.db = db
    this.outgoing = null
    this.active = 0
  }

  get (version, collectionName, range, query) {
    const message = encodeMessage({
      type: MESSAGE_TYPE.GET,
      version,
      collectionName,
      range,
      query
    })
    this.outgoing.broadcast(message)
  }

  onmessage (buf, from) {
    const message = decodeMessage(buf)
    if (!message) return
    if (message.type === MESSAGE_TYPE.GET) this.onget(message, from)
    if (message.type === MESSAGE_TYPE.CACHE) this.oncache(message, from)
  }

  oncache (message, from) {
    if (!message.blocks.length) return
    const { blocks, start, end } = message
    this.db.engine.core.download({ blocks, start, end })
  }

  onget (message, from) {
    if (!this.db.engineSnapshot) return
    const version = this.db.engineSnapshot.snapshot.core.length
    if (!message.version || message.version > version) return

    const b = new Batch(this.outgoing, from)

    const options = { checkout: message.version, extension: false, wait: false, update: false, onseq, encoded: true }
    if (message.range) this.db.find(message.collectionName, message.range, options).toArray().then(done, done)
    else this.db.get(message.collectionName, message.query, options).then(done, done)

    function done () {
      b.send()
    }

    function onseq (seq) {
      b.push(seq)
    }
  }

  static register (db) {
    if (!db.core) return null
    const e = new this(db)
    e.outgoing = db.core.registerExtension('hyperdb-extension', e)
    return e
  }
}

module.exports = HyperDBExtension
