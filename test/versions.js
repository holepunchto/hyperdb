const { test } = require('./helpers')
const tmp = require('test-tmp')
const path = require('path')

test.bee('define versionField on collection', async function ({ build }, t) {
  const dir = await tmp(t, { dir: path.join(__dirname, 'fixtures/tmp') })

  const db = await build(createExampleDB, { dir })
  await db.insert('@example/members', { name: 'boy', age: 16 })
  await db.insert('@example/members', { name: 'girl', age: 12 })

  await db.flush()
  let len = db.core.length
  await db.close()

  const db2 = await build(createExampleDB, { dir })
  await db2.insert('@example/members', { name: 'boy', age: 16 })
  await db2.insert('@example/members', { name: 'girl', age: 12 })

  await db2.flush()
  t.ok(len === db2.core.length)
  len = db2.core.length
  await db2.close()

  const dbVersions = await build(createExampleDBWithVersions, { dir })
  await dbVersions.insert('@example/members', { name: 'boy', age: 16 })
  await dbVersions.insert('@example/members', { name: 'girl', age: 12 })

  await dbVersions.flush()
  t.ok(len < dbVersions.core.length)

  const all = await dbVersions.find('@example/members-by-name2').toArray()
  t.is(all.length, 2)

  await dbVersions.close()
})

function createExampleDB(HyperDB, Hyperschema, paths) {
  const schema = Hyperschema.from(paths.schema)
  const example = schema.namespace('example')

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
    name: 'members',
    schema: '@example/member',
    key: ['name']
  })

  exampleDB.indexes.register({
    name: 'members-by-name',
    collection: '@example/members',
    unique: true,
    key: {
      type: 'string',
      map: 'mapNameToLowerCase'
    }
  })

  HyperDB.toDisk(db)
}

function createExampleDBWithVersions(HyperDB, Hyperschema, paths) {
  const schema = Hyperschema.from(paths.schema)
  const example = schema.namespace('example')

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
      },
      {
        name: 'version',
        type: 'uint'
      }
    ]
  })

  Hyperschema.toDisk(schema)

  const db = HyperDB.from(paths.schema, paths.db)
  const exampleDB = db.namespace('example')

  exampleDB.require(paths.helpers)

  exampleDB.collections.register({
    name: 'members',
    schema: '@example/member',
    key: ['name'],
    versionField: 'version'
  })

  exampleDB.indexes.register({
    name: 'members-by-name',
    collection: '@example/members',
    unique: true,
    key: {
      type: 'string',
      map: 'mapNameToLowerCase'
    }
  })

  exampleDB.indexes.register({
    name: 'members-by-name2',
    collection: '@example/members',
    unique: true,
    key: {
      type: 'string',
      map: 'mapNameToLowerCase'
    }
  })

  HyperDB.toDisk(db)
}
