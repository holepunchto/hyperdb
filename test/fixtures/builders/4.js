const HyperDB = require('../../../builder')
const Hyperschema = require('hyperschema')
const path = require('path')

const SCHEMA_DIR = path.join(__dirname, '../generated/4/hyperschema')
const DB_DIR = path.join(__dirname, '../generated/4/hyperdb')

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
      name: 'age',
      type: 'uint',
      required: true
    }
  ]
})

dbSchema.register({
  name: 'nested',
  fields: [
    {
      name: 'member',
      type: '@db/member',
      required: true
    },
    {
      name: 'fun',
      type: 'bool'
    }
  ]
})

Hyperschema.toDisk(schema)

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const testDb = db.namespace('db')

testDb.collections.register({
  name: 'nested-members',
  schema: '@db/nested',
  key: ['member.id']
})

HyperDB.toDisk(db)
