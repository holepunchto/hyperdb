const HyperDB = require('../../../builder')
const Hyperschema = require('hyperschema')
const path = require('path')

const SCHEMA_DIR = path.join(__dirname, '../generated/5/hyperschema')
const DB_DIR = path.join(__dirname, '../generated/5/hyperdb')

const schema = Hyperschema.from(SCHEMA_DIR)

const dbSchema = schema.namespace('db')

dbSchema.register({
  name: 'member',
  fields: [
    {
      name: 'id',
      type: 'string',
      required: true
    },
    {
      name: 'present',
      type: 'bool',
      required: true
    }
  ]
})

Hyperschema.toDisk(schema)

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const testDb = db.namespace('db')

testDb.collections.register({
  name: 'members',
  schema: '@db/member',
  key: ['id']
})

HyperDB.toDisk(db)
