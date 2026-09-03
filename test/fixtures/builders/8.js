const HyperDB = require('../../../builder')
const Hyperschema = require('hyperschema')
const path = require('path')

const SCHEMA_DIR = path.join(__dirname, '../generated/8/hyperschema')
const DB_DIR = path.join(__dirname, '../generated/8/hyperdb')

const schema = Hyperschema.from(SCHEMA_DIR)

const dbSchema = schema.namespace('db')

dbSchema.register({
  name: 'gender',
  strings: true,
  enum: ['NotSpecified', 'Male', 'Female']
})

dbSchema.register({
  name: 'member',
  fields: [
    {
      name: 'name',
      type: 'string',
      required: true
    },
    {
      name: 'gender',
      type: '@db/gender',
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
  key: ['name', 'gender']
})

testDb.indexes.register({
  name: 'members-by-gender',
  collection: '@db/members',
  key: ['gender']
})

HyperDB.toDisk(db)
