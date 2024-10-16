const Hyperschema = require('hyperschema')
const HyperDB = require('.')

const SCHEMA_DIR = './schema/hyperschema'
const DB_DIR = './schema/hyperdb'

const schema = Hyperschema.from(SCHEMA_DIR)
const example = schema.namespace('example')

example.register({
  name: 'alias1',
  alias: 'fixed32'
})

example.register({
  name: 'struct1',
  compact: true,
  fields: [
    {
      name: 'field1',
      type: '@example/alias1',
      required: true
    },
    {
      name: 'field1',
      type: 'uint',
      required: true
    }
  ]
})

example.register({
  name: 'struct2',
  fields: [
    {
      name: 'field1',
      type: '@example/struct1',
      required: true
    },
    {
      name: 'field2',
      type: '@example/struct1',
      required: true
    }
  ]
})

example.register({
  name: 'record1',
  fields: [
    {
      name: 'id1',
      type: 'uint',
      required: true
    },
    {
      name: 'id2',
      type: 'uint',
      required: true
    },
    {
      name: 'id3',
      type: 'uint',
      required: true
    },
    {
      name: 'struct1',
      type: '@example/struct2',
      required: true
    },
    {
      name: 'name',
      type: 'string'
    },
    {
      name: 'age',
      type: 'uint'
    },
    {
      name: 'tags',
      type: 'string',
      array: true
    }
  ]
})

example.register({
  name: 'collection-info',
  fields: [
    {
      name: 'count',
      type: 'uint'
    }
  ]
})

Hyperschema.toDisk(schema)

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const exampleDb = db.namespace('example')

exampleDb.collections.register({
  name: 'collection1-info',
  schema: '@example/collection-info',
  derived: true
})

exampleDb.collections.register({
  name: 'collection1',
  schema: '@example/record1',
  key: ['id1', 'id2'],
  trigger: async (db, key, record, context) => {
    const info = (await db.get('@example/collection1-info')) || { count: 0 }
    const existing = await db.get('@example/collection1', key)
    if (existing && record) return
    await db.insert('@example/collection1-info', { count: record ? info.count + 1 : info.count - 1 })
  }
})

exampleDb.indexes.register({
  name: 'collection1-by-struct-mapped',
  collection: '@example/collection1',
  key: {
    type: {
      fields: [
        {
          name: 'name',
          type: 'string'
        },
        {
          name: 'age',
          type: 'uint'
        }
      ]
    },
    map: (record, context) => [
      { name: record.name, age: record.age }
    ]
  }
})

exampleDb.indexes.register({
  name: 'collection1-by-id3',
  collection: '@example/collection1',
  key: ['id3'],
  unique: true
})

exampleDb.indexes.register({
  name: 'collection1-by-struct',
  collection: '@example/collection1',
  key: ['name', 'age']
})

exampleDb.indexes.register({
  name: 'collection1-by-tags',
  collection: '@example/collection1',
  key: ['name', 'tags']
})

HyperDB.toDisk(db)
