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
    c.none.preencode(state, m.key)
    c.string.preencode(state, m.id)
    c.uint.preencode(state, m.age)
  },
  encode (state, m) {
    c.none.encode(state, m.key)
    c.string.encode(state, m.id)
    c.uint.encode(state, m.age)
  },
  decode (state) {
    const res = {}
    res.key = null
    res.id = null
    res.age = 0

    res.key = c.none.decode(state)
    res.id = c.string.decode(state)
    res.age = c.uint.decode(state)

    return res
  }
}

// @db/digest/value
const encoding1 = {
  preencode (state, m) {
    c.string.preencode(state, m.id)
    c.uint.preencode(state, m.age)
  },
  encode (state, m) {
    c.string.encode(state, m.id)
    c.uint.encode(state, m.age)
  },
  decode (state) {
    const res = {}
    res.id = null
    res.age = 0

    res.id = c.string.decode(state)
    res.age = c.uint.decode(state)

    return res
  }
}

// @db/members/value
const encoding2 = {
  preencode (state, m) {
    c.uint.preencode(state, m.age)
  },
  encode (state, m) {
    c.uint.encode(state, m.age)
  },
  decode (state) {
    const res = {}
    res.age = 0

    res.age = c.uint.decode(state)

    return res
  }
}

// stats
const encoding3 = {
  preencode (state, m) {
    c.uint.preencode(state, m.id)
    c.uint.preencode(state, m.count)
  },
  encode (state, m) {
    c.uint.encode(state, m.id)
    c.uint.encode(state, m.count)
  },
  decode (state) {
    const res = {}
    res.id = 0
    res.count = 0

    res.id = c.uint.decode(state)
    res.count = c.uint.decode(state)

    return res
  }
}

// stats/value
const encoding4 = {
  preencode (state, m) {
    c.uint.preencode(state, m.count)
  },
  encode (state, m) {
    c.uint.encode(state, m.count)
  },
  decode (state) {
    const res = {}
    res.count = 0

    res.count = c.uint.decode(state)

    return res
  }
}

function getStructByName (name) {
  switch (name) {
    case '@db/member': return encoding0
    case '@db/digest/value': return encoding1
    case '@db/members/value': return encoding2
    case 'stats': return encoding3
    case 'stats/value': return encoding4
    default: throw new Error('Encoder not found ' + name)
  }
}

function resolveStruct (name, v = VERSION) {
  const enc = getStructByName(name)
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

module.exports = { resolveStruct, version }
