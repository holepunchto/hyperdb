const { test } = require('./helpers')

test('members with unique index', async function ({ build }, t) {
  const db = await build(createExampleDB)

  await db.insert('@example/members', { name: 'test', age: 10 })
  await db.insert('@example/members', { name: 'Test', age: 11 })

  {
    const all = await db.find('@example/members-by-name').toArray()
    t.alike(all, [{ name: 'Test', age: 11 }])
  }

  await db.flush()

  {
    const all = await db.find('@example/members-by-name').toArray()
    t.alike(all, [{ name: 'Test', age: 11 }])
  }

  await db.close()
})

test('members with non-unique index', async function ({ build }, t) {
  const db = await build(createExampleDB)

  await db.insert('@example/members', { name: 'test', age: 10 })
  await db.insert('@example/members', { name: 'john', age: 14 })
  await db.insert('@example/members', { name: 'bob', age: 14 })
  await db.insert('@example/members', { name: 'alice', age: 18 })

  {
    const all = await db.find('@example/teenagers').toArray()
    t.alike(all, [
      { name: 'bob', age: 14 },
      { name: 'john', age: 14 },
      { name: 'alice', age: 18 }
    ])
  }

  await db.flush()

  {
    const all = await db.find('@example/teenagers').toArray()
    t.alike(all, [
      { name: 'bob', age: 14 },
      { name: 'john', age: 14 },
      { name: 'alice', age: 18 }
    ])
  }

  await db.close()
})

test('two collections work with indexes', async function ({ build }, t) {
  const db = await build(createExampleDB)

  await db.insert('@example/members', { name: 'test', age: 10 })
  await db.insert('@example/devices', { key: 'device-1', name: 'my device' })

  const all = await db.find('@example/members-by-name').toArray()
  t.is(all.length, 1)

  await db.close()
})

test('get on an index', async function ({ build }, t) {
  const db = await build(createExampleDB)

  const expected = { name: 'test', age: 15 }
  await db.insert('@example/members', expected)

  {
    const doc = await db.get('@example/last-teenager', 15)
    t.alike(doc, expected)
  }

  {
    const doc = await db.get('@example/last-teenager', 13)
    t.is(doc, null)
  }

  {
    const doc = await db.get('@example/members-by-name', 'test')
    t.alike(doc, expected)
  }

  await db.flush()

  {
    const doc = await db.get('@example/last-teenager', 15)
    t.alike(doc, expected)
  }

  {
    const doc = await db.get('@example/last-teenager', 13)
    t.is(doc, null)
  }

  {
    const doc = await db.get('@example/members-by-name', 'test')
    t.alike(doc, expected)
  }

  await db.close()
})

function createExampleDB (HyperDB, Hyperschema, paths) {
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

  example.register({
    name: 'devices',
    fields: [
      {
        name: 'key',
        type: 'string',
        required: true
      },
      {
        name: 'name',
        type: 'string'
      }
    ]
  })

  Hyperschema.toDisk(schema)

  const db = HyperDB.from(paths.schema, paths.db)
  const exampleDB = db.namespace('example')

  exampleDB.require(paths.helpers)

  exampleDB.collections.register({
    name: 'devices',
    schema: '@example/devices',
    key: ['key']
  })

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

  exampleDB.indexes.register({
    name: 'teenagers',
    collection: '@example/members',
    key: {
      type: 'uint',
      map: 'mapTeenager'
    }
  })

  exampleDB.indexes.register({
    name: 'last-teenager',
    collection: '@example/members',
    unique: true,
    key: {
      type: 'uint',
      map: 'mapTeenager'
    }
  })

  HyperDB.toDisk(db)
}
