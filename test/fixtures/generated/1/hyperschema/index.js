// This file is autogenerated by the hyperschema compiler
// Schema Version: 1
/* eslint-disable camelcase */
/* eslint-disable quotes */

const VERSION = 1
const { c } = require('hyperschema/runtime')

// eslint-disable-next-line no-unused-vars
let version = VERSION

// @db/member
const encoding0 = {
  preencode (state, m) {
    c.string.preencode(state, m.id)
    c.uint.preencode(state, m.age)
  },
  encode (state, m) {
    c.string.encode(state, m.id)
    c.uint.encode(state, m.age)
  },
  decode (state) {
    const r0 = c.string.decode(state)
    const r1 = c.uint.decode(state)

    return {
      id: r0,
      age: r1
    }
  }
}

function setVersion (v) {
  version = v
}

function encode (name, value, v = VERSION) {
  version = v
  return c.encode(getEncoding(name), value)
}

function decode (name, buffer, v = VERSION) {
  version = v
  return c.decode(getEncoding(name), buffer)
}

function getEncoding (name) {
  switch (name) {
    case '@db/member': return encoding0
    default: throw new Error('Encoder not found ' + name)
  }
}

function resolveStruct (name, v = VERSION) {
  const enc = getEncoding(name)
  return {
    preencode (state, m) {
      version = v
      enc.preencode(state, m)
    },
    encode (state, m) {
      version = v
      enc.encode(state, m)
    },
    decode (state) {
      version = v
      return enc.decode(state)
    }
  }
}

module.exports = { resolveStruct, getEncoding, encode, decode, setVersion, version }
