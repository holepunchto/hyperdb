// This file is autogenerated by the hyperdb compiler
/* eslint-disable camelcase */

const { IndexEncoder, c } = require('hyperdb/runtime')

const { version, getEncoding, setVersion } = require('./messages.js')

// '@db/members' collection key
const collection0_key = new IndexEncoder([
  IndexEncoder.STRING
], { prefix: 0 })

function collection0_indexify (record) {
  const a = record.id
  return a === undefined ? [] : [a]
}

// '@db/members' value encoding
const collection0_enc = getEncoding('@db/member/hyperdb#0')

// '@db/members' reconstruction function
function collection0_reconstruct (version, keyBuf, valueBuf) {
  const key = collection0_key.decode(keyBuf)
  setVersion(version)
  const record = c.decode(collection0_enc, valueBuf)
  record.id = key[0]
  return record
}
// '@db/members' key reconstruction function
function collection0_reconstruct_key (keyBuf) {
  const key = collection0_key.decode(keyBuf)
  return {
    id: key[0]
  }
}

// '@db/members'
const collection0 = {
  name: '@db/members',
  id: 0,
  encodeKey (record) {
    const key = [record.id]
    return collection0_key.encode(key)
  },
  encodeKeyRange ({ gt, lt, gte, lte } = {}) {
    return collection0_key.encodeRange({
      gt: gt ? collection0_indexify(gt) : null,
      lt: lt ? collection0_indexify(lt) : null,
      gte: gte ? collection0_indexify(gte) : null,
      lte: lte ? collection0_indexify(lte) : null
    })
  },
  encodeValue (version, record) {
    setVersion(version)
    return c.encode(collection0_enc, record)
  },
  trigger: null,
  reconstruct: collection0_reconstruct,
  reconstructKey: collection0_reconstruct_key,
  indexes: []
}

// '@db/members-by-age' collection key
const index1_key = new IndexEncoder([
  IndexEncoder.UINT,
  IndexEncoder.STRING
], { prefix: 1 })

function index1_indexify (record) {
  const arr = []

  const a0 = record.age
  if (a0 === undefined) return arr
  arr.push(a0)

  const a1 = record.id
  if (a1 === undefined) return arr
  arr.push(a1)

  return arr
}

// '@db/members-by-age'
const index1 = {
  name: '@db/members-by-age',
  id: 1,
  encodeKey (record) {
    return index1_key.encode(index1_indexify(record))
  },
  encodeKeyRange ({ gt, lt, gte, lte } = {}) {
    return index1_key.encodeRange({
      gt: gt ? index1_indexify(gt) : null,
      lt: lt ? index1_indexify(lt) : null,
      gte: gte ? index1_indexify(gte) : null,
      lte: lte ? index1_indexify(lte) : null
    })
  },
  encodeValue: (doc) => index1.collection.encodeKey(doc),
  encodeIndexKeys (record, context) {
    return [index1_key.encode([record.age, record.id])]
  },
  reconstruct: (keyBuf, valueBuf) => valueBuf,
  offset: collection0.indexes.length,
  collection: collection0
}
collection0.indexes.push(index1)

module.exports = {
  version,
  collections: [
    collection0
  ],
  indexes: [
    index1
  ],
  resolveCollection,
  resolveIndex
}

function resolveCollection (name) {
  switch (name) {
    case '@db/members': return collection0
    default: return null
  }
}

function resolveIndex (name) {
  switch (name) {
    case '@db/members-by-age': return index1
    default: return null
  }
}
