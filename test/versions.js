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

test.bee('versioned collection schema maps old rows on read', async function ({ build }, t) {
  const dir = await tmp(t, { dir: path.join(__dirname, 'fixtures/tmp') })

  const db = await build(createVersionedDB, { dir })
  await db.insert('@example/things', { version: 1, id: 'a', title: 'hello' })
  await db.flush()
  await db.close()

  // build() re-requires the generated index.js but not messages.js - refresh it by hand
  delete require.cache[require.resolve(path.join(dir, 'hyperdb/messages.js'))]

  const db2 = await build(createVersionedDBWithV2, { dir })
  const row = await db2.get('@example/things', { id: 'a' })
  await db2.close()

  t.alike(row, { version: 2, id: 'a', name: 'hello' })
})

test.bee('key path through a nested versioned field resolves', async function ({ build }, t) {
  const dir = await tmp(t, { dir: path.join(__dirname, 'fixtures/tmp') })

  const db = await build(createNestedVersionedDB, { dir })
  await db.insert('@example/wrappers', { thing: { version: 1, id: 'a', title: 'hello' } })
  await db.flush()
  const row = await db.get('@example/wrappers', { thing: { id: 'a' } })
  await db.close()

  t.alike(row, { thing: { version: 1, id: 'a', title: 'hello' } })
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

function registerThingV1(example) {
  example.register({
    name: 'thing-v1',
    fields: [
      {
        name: 'id',
        type: 'string',
        required: true
      },
      {
        name: 'title',
        type: 'string',
        required: true
      }
    ]
  })
}

function createVersionedDB(HyperDB, Hyperschema, paths) {
  const schema = Hyperschema.from(paths.schema)
  const example = schema.namespace('example')

  registerThingV1(example)

  example.register({
    name: 'thing',
    versions: [
      {
        version: 1,
        type: '@example/thing-v1'
      }
    ]
  })

  Hyperschema.toDisk(schema)

  const db = HyperDB.from(paths.schema, paths.db)
  const exampleDB = db.namespace('example')

  exampleDB.collections.register({
    name: 'things',
    schema: '@example/thing',
    key: ['id']
  })

  HyperDB.toDisk(db)
}

function createVersionedDBWithV2(HyperDB, Hyperschema, paths) {
  const schema = Hyperschema.from(paths.schema)
  const example = schema.namespace('example')

  example.require(paths.helpers)

  registerThingV1(example)

  example.register({
    name: 'thing-v2',
    fields: [
      {
        name: 'id',
        type: 'string',
        required: true
      },
      {
        name: 'name',
        type: 'string',
        required: true
      }
    ]
  })

  example.register({
    name: 'thing',
    versions: [
      {
        version: 1,
        type: '@example/thing-v1',
        map: 'thingV1ToV2'
      },
      {
        version: 2,
        type: '@example/thing-v2'
      }
    ]
  })

  Hyperschema.toDisk(schema)

  const db = HyperDB.from(paths.schema, paths.db)
  const exampleDB = db.namespace('example')

  exampleDB.collections.register({
    name: 'things',
    schema: '@example/thing',
    key: ['id']
  })

  HyperDB.toDisk(db)
}

function createNestedVersionedDB(HyperDB, Hyperschema, paths) {
  const schema = Hyperschema.from(paths.schema)
  const example = schema.namespace('example')

  registerThingV1(example)

  example.register({
    name: 'thing',
    versions: [
      {
        version: 1,
        type: '@example/thing-v1'
      }
    ]
  })

  example.register({
    name: 'wrapper',
    fields: [
      {
        name: 'thing',
        type: '@example/thing',
        required: true
      }
    ]
  })

  Hyperschema.toDisk(schema)

  const db = HyperDB.from(paths.schema, paths.db)
  const exampleDB = db.namespace('example')

  exampleDB.collections.register({
    name: 'wrappers',
    schema: '@example/wrapper',
    key: ['thing.id']
  })

  HyperDB.toDisk(db)
}
