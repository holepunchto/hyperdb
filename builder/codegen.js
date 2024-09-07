/*
const contract = require('./description.js')
const version = contract.version //schema version
const indexes = contract.indexes
const collections = contract.collections
const type = contract.resolveCollection('@keet/devices')
{
  name: '@keet/devices',
  encodeKey, -> full record (index encode internally) to buffer
  encodeKeyRange, -> range options with full records (index encode internally) -> (all gt/lte options set)
  encodeValue(version, value) -> full record to buffer
  reconstruct(version, keyBuffer, valueBuffer) -> { ...key, ...value }, (only on coll)
  indexes
}

const type = contract.resolveIndex('@keet/devices-by-name')
{
  name: '@keet/devices-by-name',
  offset, -> position in the collection's index array
  encodeKey, -> full record (index encode internally) to buffer
  encodeKeyRange, -> range options with full records (index encode internally) -> (all gt/lte options set)
  collection
}
*/

const gen = require('generate-object-property')
const s = require('generate-string')

const IndexTypeMap = new Map([
  ['uint', 'IndexEncoder.UINT'],
  ['uint8', 'IndexEncoder.UINT'],
  ['uint16', 'IndexEncoder.UINT'],
  ['uint24', 'IndexEncoder.UINT'],
  ['uint32', 'IndexEncoder.UINT'],
  ['uint40', 'IndexEncoder.UINT'],
  ['uint48', 'IndexEncoder.UINT'],
  ['uint56', 'IndexEncoder.UINT'],
  ['uint64', 'IndexEncoder.UINT'],
  ['string', 'IndexEncoder.STRING'],
  ['utf8', 'IndexEncoder.STRING'],
  ['ascii', 'IndexEncoder.STRING'],
  ['hex', 'IndexEncoder.STRING'],
  ['base64', 'IndexEncoder.STRING'],
  ['fixed32', 'IndexEncoder.BUFFER'],
  ['fixed64', 'IndexEncoder.BUFFER'],
  ['buffer', 'IndexEncoder.BUFFER']
])

module.exports = function generateCode (hyperdb, { runtime } = {}) {
  let str = ''
  str += '// This file is autogenerated by the hyperdb compiler\n'
  str += '/* eslint-disable camelcase */\n'
  str += '\n'
  str += `const { IndexEncoder, c } = require('${runtime}')\n`
  str += '\n'
  str += 'const { version, resolveStruct } = require(\'./messages.js\')\n'
  str += '\n'

  const collections = []
  const indexes = []
  for (let i = 0; i < hyperdb.orderedTypes.length; i++) {
    const type = hyperdb.orderedTypes[i]
    if (type.isCollection) {
      const id = `collection${collections.length}`
      collections.push({ id, type })
      str += generateCollectionDefinition(id, type)
    } else if (type.isIndex) {
      const id = `index${indexes.length}`
      indexes.push({ id, type })
      str += generateIndexDefinition(id, type)
    }
    str += '\n'
  }

  str += 'const IndexMap = new Map([\n'
  for (let i = 0; i < indexes.length; i++) {
    const { id, type } = indexes[i]
    str += `  [${s(type.fqn)}, ${id}]`
    if (i === indexes.length - 1) str += '\n'
    else str += ',\n'
  }
  str += '])\n'
  str += 'const CollectionMap = new Map([\n'
  for (let i = 0; i < collections.length; i++) {
    const { id, type } = collections[i]
    str += `  [${s(type.fqn)}, ${id}]`
    if (i === collections.length - 1) str += '\n'
    else str += ',\n'
  }
  str += '])\n'
  str += 'const Collections = [...CollectionMap.values()]\n'
  str += 'const Indexes = [...IndexMap.values()]\n'

  str += 'for (const index of IndexMap.values()) {\n'
  str += '  const collection = CollectionMap.get(index._collectionName)\n'
  str += '  collection.indexes.push(index)\n'
  str += '  index.collection = collection\n'
  str += '  index.offset = collection.indexes.length - 1\n'
  str += '}\n'
  str += '\n'

  str += 'function resolveCollection (fqn) {\n'
  str += '  const coll = CollectionMap.get(fqn)\n'
  str += '  return coll || null\n'
  str += '}\n'
  str += '\n'

  str += 'function resolveIndex (fqn) {\n'
  str += '  const index = IndexMap.get(fqn)\n'
  str += '  return index || null\n'
  str += '}\n'
  str += '\n'

  str += 'module.exports = {\n'
  str += '  version,\n'
  str += '  collections: Collections,\n'
  str += '  indexes: Indexes,\n'
  str += '  resolveCollection,\n'
  str += '  resolveIndex\n'
  str += '}\n'

  return str
}

function generateCommonPrefix (id, type) {
  let str = ''

  str += `// ${s(type.fqn)} collection key\n`
  str += `const ${id}_key = ${generateIndexKeyEncoding(type)}\n`
  str += '\n'

  str += `function ${id}_indexify (record) {\n`
  str += '  const arr = []\n'
  str += '\n'
  for (let i = 0; i < type.fullKey.length; i++) {
    const key = type.fullKey[i]
    const r = (a, b, i) => (i === 0) ? gen(a, b) : gen.optional(a, b)
    str += `  const a${i} = ${key.split('.').reduce(r, 'record')}\n`
    str += `  if (a${i} === undefined) return arr\n`
    str += `  arr.push(a${i})\n`
    str += '\n'
  }
  str += '  return arr\n'
  str += '}\n'
  str += '\n'

  return str
}

function generateCollectionDefinition (id, collection) {
  let str = generateCommonPrefix(id, collection)

  str += `// ${s(collection.fqn)} reconstruction function\n`
  str += `function ${id}_reconstruct (version, keyBuf, valueBuf) {\n`
  str += '  // TODO: This should be fully code generated\n'
  str += '  const key = collection0_key.decode(keyBuf)\n'
  str += `  const value = c.decode(resolveStruct(${s(collection.valueEncoding)}, version), valueBuf)\n`
  str += '  return {\n'
  for (let i = 0; i < collection.key.length; i++) {
    const key = collection.key[i]
    str += `    ${gen.property(key)}: key[${i}],\n`
  }
  str += '    ...value\n'
  str += '  }\n'
  str += '}\n'

  str += '\n'
  str += `// ${s(collection.fqn)}\n`
  str += `const ${id} = {\n`
  str += `  name: ${s(collection.fqn)},\n`
  str += `  encodeKey: ${generateEncodeIndexKey(id, collection)},\n`
  str += `  encodeKeyRange: ${generateEncodeKeyRange(id, collection)},\n`
  str += `  encodeValue: ${generateEncodeCollectionValue(collection)},\n`
  str += `  reconstruct: ${id}_reconstruct,\n`
  str += '  indexes: []\n'
  str += '}\n'
  return str
}

function generateIndexDefinition (id, index) {
  let str = generateCommonPrefix(id, index)
  str += `// ${s(index.fqn)}\n`
  str += `const ${id} = {\n`
  str += `  _collectionName: ${s(index.description.collection)},\n`
  str += `  name: ${s(index.fqn)},\n`
  str += `  encodeKey: ${generateEncodeIndexKey(id, index)},\n`
  str += `  encodeKeyRange: ${generateEncodeKeyRange(id, index)},\n`
  str += `  encodeValue: (doc) => ${id}.encodeKey(doc),\n`
  str += '  reconstruct: (keyBuf, valueBuf) => valueBuf,\n'
  str += '  offset: 0,\n'
  str += '  collection: null\n'
  str += '}\n'
  return str
}

function generateEncodeKeyRange (id, index) {
  let str = ''
  str += 'function encodeKeyRange ({ gt, lt, gte, lte } = {}) {\n'
  str += `    return ${id + '_key'}.encodeRange({\n`
  str += `      gt: gt ? ${id}_indexify(gt) : null,\n`
  str += `      lt: lt ? ${id}_indexify(lt) : null,\n`
  str += `      gte: gte ? ${id}_indexify(gte) : null,\n`
  str += `      lte: lte ? ${id}_indexify(lte) : null\n`
  str += '    })\n'
  str += '  }'
  return str
}

function generateEncodeCollectionValue (collection) {
  let str = ''
  str += 'function encodeValue (version, record) {\n'
  str += `    return c.encode(resolveStruct(${s(collection.valueEncoding)}, version), record)\n`
  str += '  }'
  return str
}

function generateEncodeIndexKey (id, index) {
  const accessors = index.fullKey.map(c => {
    return c.split('.').reduce(gen, 'record')
  })
  let str = ''
  str += 'function encodeKey (record) {\n'
  str += `    const key = [${accessors.join(', ')}]\n`
  str += `    return ${id + '_key'}.encode(key)\n`
  str += '  }'
  return str
}

function generateIndexKeyEncoding (type) {
  let str = 'new IndexEncoder([\n'
  for (let i = 0; i < type.fullKey.length; i++) {
    const component = type.keyEncoding[i]
    str += '  ' + IndexTypeMap.get(component)
    if (i !== type.fullKey.length - 1) str += ',\n'
    else str += '\n'
  }
  str += `], { prefix: ${type.id} })`
  return str
}
