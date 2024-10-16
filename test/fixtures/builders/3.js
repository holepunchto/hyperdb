const HyperDB = require('../../../builder')
const Hyperschema = require('hyperschema')
const path = require('path')

const SCHEMA_DIR = path.join(__dirname, '../generated/3/hyperschema')
const DB_DIR = path.join(__dirname, '../generated/3/hyperdb')

const schema = Hyperschema.from(SCHEMA_DIR)

const dbSchema = schema.namespace('db')

dbSchema.register({
  name: 'member',
  fields: [
    {
      name: 'key',
      type: 'none',
      required: true
    },
    {
      name: 'id',
      type: 'string',
      required: true
    },
    {
      name: 'age',
      type: 'uint',
      required: true
    }
  ]
})

Hyperschema.toDisk(schema)

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const testDb = db.namespace('db')

testDb.collections.register({
  name: 'members',
  stats: true,
  schema: '@db/member',
  key: ['key', 'id']
})

testDb.indexes.register({
  name: 'members-by-age',
  collection: '@db/members',
  key: ['key', 'age']
})

HyperDB.toDisk(db)
