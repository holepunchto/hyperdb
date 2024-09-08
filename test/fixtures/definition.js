// normally this is generated, this is just here to test the general interface

const c = require('compact-encoding')
const IndexEncoder = require('index-encoder')

const memberKey = new IndexEncoder([IndexEncoder.STRING], { prefix: 0 })
const memberByAge = new IndexEncoder([IndexEncoder.UINT, IndexEncoder.STRING], { prefix: 1 })

const struct = {
  preencode (state, doc) {
    c.string.preencode(state, doc.id)
    c.uint.preencode(state, doc.age)
  },
  encode (state, doc) {
    c.string.encode(state, doc.id)
    c.uint.encode(state, doc.age)
  },
  decode (state) {
    return { id: c.string.decode(state), age: c.uint.decode(state) }
  }
}

const membersCollection = {
  name: 'members',
  encodeKey (doc) {
    return memberKey.encode([doc.id])
  },
  encodeKeyRange (range) {
    return memberKey.encodeRange({}) // fix later
  },
  encodeValue (version, doc) {
    return c.encode(struct, doc)
  },
  reconstruct (version, keyBuffer, valueBuffer) {
    return c.decode(struct, valueBuffer)
  },
  indexes: []
}

const membersByAgeIndex = {
  name: 'members/by-age',
  offset: 0,
  encodeKey (doc) {
    return memberByAge.encode([doc.age, doc.id])
  },
  encodeKeyRange (range) {
    const r = {
      gt: null,
      gte: null,
      lt: null,
      lte: null
    }

    const toArray = (entry) => {
      const all = []
      if (typeof entry.age !== 'number') return all
      all.push(entry.age)
      return all
    }

    if (range.gt) r.gt = toArray(range.gt)
    else if (range.gte) r.gte = toArray(range.gte)
    else r.gt = toArray({})

    if (range.lt) r.lt = toArray(range.lt)
    else if (range.lte) r.lte = toArray(range.lte)
    else r.lt = toArray({})

    return memberByAge.encodeRange(r)
  },
  encodeValue (doc) {
    return membersCollection.encodeKey(doc)
  },
  reconstruct (keyBuf, valueBuf) {
    return valueBuf
  },
  collection: membersCollection
}

membersCollection.indexes.push(membersByAgeIndex)

module.exports = {
  version: 0,
  resolveCollection (name) {
    if (name === membersCollection.name) return membersCollection
    return null
  },
  resolveIndex (name) {
    if (name === membersByAgeIndex.name) return membersByAgeIndex
    return null
  }
}
