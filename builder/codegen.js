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
  encodeKeys, -> full record (index encode internally) to an array of buffers
  encodeKeyRange, -> range options with full records (index encode internally) -> (all gt/lte options set)
  collection
}
*/

const gen = require('generate-object-property')
const s = require('generate-string')
const pkg = require('../package.json')

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

module.exports = function generateCode (hyperdb) {
  let str = ''
  str += '// This file is autogenerated by the hyperdb compiler\n'
  str += '/* eslint-disable camelcase */\n'
  str += '\n'
  str += `const { IndexEncoder, c } = require('${pkg.name}/runtime')\n`
  str += '\n'
  str += 'const { version, resolveStruct } = require(\'./messages.js\')\n'
  str += '\n'

  const collections = []
  const indexes = []

  for (let i = 0; i < hyperdb.orderedTypes.length; i++) {
    const type = hyperdb.orderedTypes[i]
    if (type.isCollection) {
      collections.push(type)
      str += generateCollectionDefinition(type)
    } else if (type.isIndex) {
      indexes.push(type)
      str += generateIndexDefinition(type)
    }
    str += '\n'
  }

  str += 'module.exports = {\n'
  str += '  version,\n'
  str += '  collections: [\n'
  for (let i = 0; i < collections.length; i++) {
    str += `    ${getId(collections[i]) + (i < collections.length - 1 ? ',' : '')}\n`
  }
  str += '  ],\n'
  str += '  indexes: [\n'
  for (let i = 0; i < indexes.length; i++) {
    str += `    ${getId(indexes[i]) + (i < indexes.length - 1 ? ',' : '')}\n`
  }
  str += '  ],\n'
  str += '  resolveCollection,\n'
  str += '  resolveIndex\n'
  str += '}\n'

  str += '\n'

  str += 'function resolveCollection (name) {\n'
  str += '  switch (name) {\n'
  for (let i = 0; i < collections.length; i++) {
    const type = collections[i]
    str += `    case ${s(type.fqn)}: return ${getId(type)}\n`
  }
  str += '    default: return null\n'
  str += '  }\n'
  str += '}\n'
  str += '\n'

  str += 'function resolveIndex (name) {\n'
  str += '  switch (name) {\n'
  for (let i = 0; i < indexes.length; i++) {
    const type = indexes[i]
    str += `    case ${s(type.fqn)}: return ${getId(type)}\n`
  }
  str += '    default: return null\n'
  str += '  }\n'
  str += '}\n'

  return str
}

function generateCommonPrefix (type) {
  const id = type.isCollection ? getId(type) : getId(type)

  let str = ''

  str += `// ${s(type.fqn)} collection key\n`
  str += `const ${id}_key = ${generateIndexKeyEncoding(type)}\n`
  str += '\n'

  if (type.isMapped) {
    str += `// ${s(type.fqn)} has the following schema defined key map\n`
    str += `const ${id}_map = ${toArrowFunction(type.map, false)}\n`
    str += '\n'
  }

  str += `function ${id}_indexify (record) {\n`

  // mapped types can only support ranges in the map space when non-unique
  const len = type.isMapped ? type.indexKey.length : type.fullKey.length

  if (len === 0) {
    str += '  return []\n'
  } else if (len === 1) {
    str += `  const a = ${getKeyPath(type.fullKey[0], 'record')}\n`
    str += '  return a === undefined ? [] : [a]\n'
  } else {
    str += '  const arr = []\n'
    str += '\n'

    for (let i = 0; i < len; i++) {
      const key = type.fullKey[i]
      str += `  const a${i} = ${getKeyPath(key, 'record')}\n`
      str += `  if (a${i} === undefined) return arr\n`
      str += `  arr.push(a${i})\n`
      str += '\n'
    }
    str += '  return arr\n'
  }

  str += '}\n'
  str += '\n'

  return str
}

function generateCollectionDefinition (collection) {
  const id = getId(collection)

  let str = generateCommonPrefix(collection)

  if (collection.trigger) {
    str += `// ${s(collection.fqn)} has the following schema defined trigger\n`
    str += `const ${id}_trigger = ${toArrowFunction(collection.trigger, true)}\n`
    str += '\n'
  }

  str += `// ${s(collection.fqn)} reconstruction function\n`
  str += `function ${id}_reconstruct (version, keyBuf, valueBuf) {\n`
  if (collection.key.length) str += `  const key = ${id}_key.decode(keyBuf)\n`
  str += `  const value = c.decode(resolveStruct(${s(collection.valueEncoding)}, version), valueBuf)\n`
  if (collection.key.length === 0) {
    str += '  return value\n'
  } else {
    str += '  // TODO: This should be fully code generated\n'
    str += '  return {\n'
    for (let i = 0; i < collection.key.length; i++) {
      const key = collection.key[i]
      str += `    ${gen.property(key)}: key[${i}],\n`
    }
    str += '    ...value\n'
    str += '  }\n'
  }
  str += '}\n'

  str += '\n'
  str += `// ${s(collection.fqn)}\n`
  str += `const ${id} = {\n`
  str += `  name: ${s(collection.fqn)},\n`
  str += `  id: ${collection.id},\n`
  str += `  stats: ${collection.stats},\n`
  str += `  encodeKey: ${generateEncodeCollectionKey(collection)},\n`
  str += `  encodeKeyRange: ${generateEncodeKeyRange(collection)},\n`
  str += `  encodeValue: ${generateEncodeCollectionValue(collection)},\n`
  str += `  trigger: ${collection.trigger ? id + '_trigger' : 'null'},\n`
  str += `  reconstruct: ${id}_reconstruct,\n`
  str += '  indexes: []\n'
  str += '}\n'
  return str
}

function generateIndexDefinition (index) {
  const id = getId(index)
  const collectionId = getId(index.collection)

  let str = generateCommonPrefix(index)
  str += `// ${s(index.fqn)}\n`
  str += `const ${id} = {\n`
  str += `  name: ${s(index.fqn)},\n`
  str += `  id: ${index.id},\n`
  str += `  stats: ${index.stats},\n`
  str += `  encodeKey: ${generateEncodeIndexKey(index)},\n`
  str += `  encodeKeyRange: ${generateEncodeKeyRange(index)},\n`
  str += `  encodeValue: (doc) => ${id}.collection.encodeKey(doc),\n`
  str += `  encodeIndexKeys: ${generateEncodeIndexKeys(index)},\n`
  str += '  reconstruct: (keyBuf, valueBuf) => valueBuf,\n'
  str += `  offset: ${collectionId}.indexes.length,\n`
  str += `  collection: ${collectionId}\n`
  str += '}\n'
  str += `${collectionId}.indexes.push(${id})\n`
  return str
}

function generateEncodeKeyRange (index) {
  const id = getId(index)

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

function generateEncodeCollectionKey (collection) {
  const id = getId(collection)

  const accessors = toProps('record', collection.fullKey)
  let str = ''
  str += 'function encodeKey (record) {\n'
  str += `    const key = [${accessors.join(', ')}]\n`
  str += `    return ${id + '_key'}.encode(key)\n`
  str += '  }'
  return str
}

function generateEncodeIndexKeys (index) {
  const id = getId(index)

  let str = ''
  str += 'function encodeKeys (record, context) {\n'
  if (index.isMapped) {
    const indexAccessors = toProps('mappedRecord', index.indexKey)
    const recordAccessors = toProps('record', index.fullKey.slice(index.indexKey.length))
    const accessors = indexAccessors.concat(recordAccessors)
    str += `    const mapped = ${id}_map(record, context)\n`
    str += '    const keys = new Array(mapped.length)\n'
    str += '    for (let i = 0; i < mapped.length; i++) {\n'
    str += '      const mappedRecord = mapped[i]\n'
    str += `      keys[i] = ${id + '_key'}.encode([${accessors.join(', ')}])\n`
    str += '    }\n'
    str += '    return keys\n'
  } else {
    const accessors = toProps('record', index.fullKey)
    str += `    return [${id + '_key'}.encode([${accessors.join(', ')}])]\n`
  }
  str += '  }'
  return str
}

function generateEncodeIndexKey (index) {
  const id = getId(index)

  let str = ''
  str += 'function encodeKey (record) {\n'
  str += `    return ${id}_key.encode(${id}_indexify(record))\n`
  str += '  }'
  return str
}

function toProps (name, keys) {
  return keys.map(c => c === null ? name : c.split('.').reduce(gen, name))
}

function generateIndexKeyEncoding (type) {
  let str = 'new IndexEncoder([\n'
  for (let i = 0; i < type.keyEncoding.length; i++) {
    const component = type.keyEncoding[i]
    str += '  ' + IndexTypeMap.get(component)
    if (i !== type.keyEncoding.length - 1) str += ',\n'
    else str += '\n'
  }
  str += `], { prefix: ${type.id} })`
  return str
}

function toArrowFunction (str, async) {
  str = deintentFunction(str + '')
  str = str.replace(/^\s*async\s*/gm, '')

  const prefix = async ? 'async ' : ''
  const bracket = str.indexOf('{')
  const arrow = str.indexOf('>')
  const isArrow = arrow > -1 && (bracket === -1 || arrow < bracket)

  if (isArrow) return prefix + str.trimLeft()

  const start = str.indexOf('(')
  const end = str.lastIndexOf(')', bracket) + 1

  return prefix + str.slice(start, end) + ' => ' + str.slice(bracket)
}

function deintentFunction (str) {
  const m = str.trimRight().match(/\n(\s+)[}\]]$/m)
  if (!m) return str

  const indent = m[1]
  let result = ''

  for (const line of str.split('\n')) {
    const t = line.trimRight()
    result += (t.startsWith(indent) ? t.slice(indent.length) : t) + '\n'
  }

  return result.trimRight()
}

function getId (type) {
  return type.isCollection ? getCollectionId(type) : getIndexId(type)
}

function getCollectionId (collection) {
  return 'collection' + collection.id
}

function getIndexId (index) {
  return 'index' + index.id
}

function getKeyPath (key, name) {
  if (key === null) return name
  const r = (a, b, i) => (i === 0) ? gen(a, b) : gen.optional(a, b)
  return key.split('.').reduce(r, 'record')
}
