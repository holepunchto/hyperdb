const Hyperschema = require('hyperschema')

const SCHEMA_DIR = './spec/hyperschema'

const schema = Hyperschema.from(SCHEMA_DIR)
const ns = schema.namespace('hyperdb-extension')

ns.register({
  name: 'range',
  compact: true,
  fields: [
    {
      name: 'gt',
      type: 'buffer'
    },
    {
      name: 'gte',
      type: 'buffer'
    },
    {
      name: 'lt',
      type: 'buffer'
    },
    {
      name: 'lte',
      type: 'buffer'
    },
    {
      name: 'reverse',
      type: 'bool'
    },
    {
      name: 'limit',
      type: 'int'
    }
  ]
})

ns.register({
  name: 'message',
  compact: true,
  fields: [
    {
      name: 'type',
      type: 'uint',
      required: true
    },
    {
      name: 'version',
      type: 'uint'
    },
    {
      name: 'collectionName',
      type: 'string'
    },
    {
      name: 'range',
      type: '@hyperdb-extension/range'
    },
    {
      name: 'query',
      type: 'buffer'
    },
    {
      name: 'blocks',
      type: 'uint',
      array: true
    },
    {
      name: 'start',
      type: 'uint'
    },
    {
      name: 'end',
      type: 'uint'
    }
  ]
})

Hyperschema.toDisk(schema)
