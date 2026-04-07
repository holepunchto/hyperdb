const HyperDB = require('../../../builder')
const Hyperschema = require('hyperschema')
const path = require('path')

const SCHEMA_DIR = path.join(__dirname, '../generated/8/hyperschema')
const DB_DIR = path.join(__dirname, '../generated/8/hyperdb')

const schema = Hyperschema.from(SCHEMA_DIR)

const dbSchema = schema.namespace('db')

dbSchema.register({
  name: 'status',
  enum: ['pending', 'active', 'completed'],
  strings: true
})

dbSchema.register({
  name: 'task',
  fields: [
    {
      name: 'project',
      type: 'string',
      required: true
    },
    {
      name: 'status',
      type: '@db/status',
      required: true
    },
    {
      name: 'name',
      type: 'string',
      required: true
    }
  ]
})

Hyperschema.toDisk(schema)

const db = HyperDB.from(SCHEMA_DIR, DB_DIR)
const testDb = db.namespace('db')

testDb.collections.register({
  name: 'tasks',
  schema: '@db/task',
  key: ['project', 'status', 'name']
})

HyperDB.toDisk(db)
