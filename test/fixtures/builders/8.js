const HyperDB = require('../../../builder')
const Hyperschema = require('hyperschema')
const path = require('path')

const SCHEMA_DIR = path.join(__dirname, '../generated/8/hyperschema')
const DB_DIR = path.join(__dirname, '../generated/8/hyperdb')

const schema = Hyperschema.from(SCHEMA_DIR)

const dbSchema = schema.namespace('db')

dbSchema.register({
  name: 'tags',
  type: 'string',
  array: true
})

dbSchema.register({
  name: 'book',
  fields: [
    {
      name: 'title',
      type: 'string',
      required: true
    },
    {
      name: 'tags',
      type: '@db/tags',
      required: true
    }
  ]
})

Hyperschema.toDisk(schema)

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const testDb = db.namespace('db')

testDb.collections.register({
  name: 'books',
  schema: '@db/book',
  key: ['title', 'tags']
})

testDb.indexes.register({
  name: 'books-by-tag',
  collection: '@db/books',
  key: ['tags']
})

HyperDB.toDisk(db)
