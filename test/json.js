const HyperDB = require('../builder')
const { test } = require('./helpers')
const tmp = require('test-tmp')
const path = require('path')

test.bee('basic checkouts', async function ({ build }, t) {
  const dir = await tmp(t, { dir: path.join(__dirname, './fixtures/tmp') })
  const db = await build(createExampleDB, { dir })

  const schemaDir = path.join(dir, 'hyperschema')
  const dbDir = path.join(dir, 'hyperdb')

  const hyperdb = HyperDB.from(schemaDir, dbDir)
  t.is(hyperdb.namespaces.size, 1)

  await db.close()
})

function createExampleDB (HyperDB, Hyperschema, paths) {
  const schema = Hyperschema.from(paths.schema)
  const example = schema.namespace('example')

  example.register({
    name: 'digest',
    fields: [
      {
        name: 'count',
        type: 'uint',
        required: true
      }
    ]
  })

  example.register({
    name: 'member',
    fields: [
      {
        name: 'name',
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

  const db = HyperDB.from(paths.schema, paths.db)

  const exampleDB = db.namespace('example')

  exampleDB.require(paths.helpers)

  exampleDB.collections.register({
    name: 'digest',
    schema: '@example/digest',
    key: []
  })

  exampleDB.collections.register({
    name: 'members',
    schema: '@example/member',
    key: ['name'],
    trigger: 'triggerCountMembers'
  })

  console.log('V1', db)

  HyperDB.toDisk(db)
}
