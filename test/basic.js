const definition = require('./fixtures/definition')
const { test } = require('./helpers')
const tmp = require('test-tmp')

test('basic full example', async function ({ create }, t) {
  const db = await create(definition)

  await db.insert('members', { id: 'maf', age: 34 })
  await db.insert('members', { id: 'andrew', age: 34 })
  await db.insert('members', { id: 'anna', age: 32 })
  await db.flush()

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 34 }
    ])
  }

  // // stop lying
  await db.insert('members', { id: 'maf', age: 37 })

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 37 }
    ])
  }

  {
    const result = await db
      .find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true })
      .toArray()
    t.alike(result, [
      { id: 'maf', age: 37 },
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'anna', age: 32 },
      { id: 'maf', age: 37 }
    ])
  }

  t.alike(await db.get('members', { id: 'maf' }), { id: 'maf', age: 37 })
  t.alike(await db.get('members', { id: 'anna' }), { id: 'anna', age: 32 })
  t.alike(await db.get('members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})

test('basic multi get', async function ({ create }, t) {
  const db = await create(definition)

  await db.insert('members', { id: 'maf', age: 34 })
  await db.insert('members', { id: 'andrew', age: 34 })
  await db.insert('members', { id: 'anna', age: 32 })
  await db.flush()

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 34 }
    ])
  }

  // // stop lying
  await db.insert('members', { id: 'maf', age: 37 })

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 37 }
    ])
  }

  {
    const result = await db
      .find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true })
      .toArray()
    t.alike(result, [
      { id: 'maf', age: 37 },
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'anna', age: 32 },
      { id: 'maf', age: 37 }
    ])
  }

  const [a, b, c] = await db.getAll([
    ['members', { id: 'maf' }],
    ['members', { id: 'anna' }],
    ['members', { id: 'andrew' }]
  ])

  t.alike(a, { id: 'maf', age: 37 })
  t.alike(b, { id: 'anna', age: 32 })
  t.alike(c, { id: 'andrew', age: 34 })

  await db.close()
})

test('delete record', async function ({ create }, t) {
  const db = await create(definition)

  await db.insert('members', { id: 'maf', age: 34 })
  await db.insert('members', { id: 'andrew', age: 34 })
  await db.flush()

  await db.delete('members', { id: 'maf' })

  {
    const result = await db.find('members').toArray()
    t.alike(result, [{ id: 'andrew', age: 34 }])
  }

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [{ id: 'andrew', age: 34 }])
  }

  await db.flush()

  {
    const result = await db.find('members').toArray()
    t.alike(result, [{ id: 'andrew', age: 34 }])
  }

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [{ id: 'andrew', age: 34 }])
  }

  t.alike(await db.get('members', { id: 'maf' }), null)
  t.alike(await db.get('members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})

test('generated full example', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.insert('@db/members', { id: 'andrew', age: 34 })
  await db.insert('@db/members', { id: 'anna', age: 32 })
  await db.flush()

  {
    const result = await db
      .find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } })
      .toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 34 }
    ])
  }

  // // stop lying
  await db.insert('@db/members', { id: 'maf', age: 37 })

  {
    const result = await db
      .find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } })
      .toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 37 }
    ])
  }

  {
    const result = await db
      .find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true })
      .toArray()
    t.alike(result, [
      { id: 'maf', age: 37 },
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('@db/members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'anna', age: 32 },
      { id: 'maf', age: 37 }
    ])
  }

  t.alike(await db.get('@db/members', { id: 'maf' }), { id: 'maf', age: 37 })
  t.alike(await db.get('@db/members', { id: 'anna' }), { id: 'anna', age: 32 })
  t.alike(await db.get('@db/members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})

test('generated delete record', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.insert('@db/members', { id: 'andrew', age: 34 })
  await db.flush()

  await db.delete('@db/members', { id: 'maf' })

  {
    const result = await db.find('@db/members').toArray()
    t.alike(result, [{ id: 'andrew', age: 34 }])
  }

  {
    const result = await db
      .find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } })
      .toArray()
    t.alike(result, [{ id: 'andrew', age: 34 }])
  }

  await db.flush()

  {
    const result = await db.find('@db/members').toArray()
    t.alike(result, [{ id: 'andrew', age: 34 }])
  }

  {
    const result = await db
      .find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } })
      .toArray()
    t.alike(result, [{ id: 'andrew', age: 34 }])
  }

  t.alike(await db.get('@db/members', { id: 'maf' }), null)
  t.alike(await db.get('@db/members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})

test('delete from memview', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.delete('@db/members', { id: 'maf' })

  t.is(await db.get('@db/members', { id: 'maf' }), null)

  await db.close()
})

test('watch', async function ({ create }, t) {
  t.plan(4)

  const db = await create()

  let changed = false

  db.watch(function () {
    changed = true
  })

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.flush()

  t.ok(changed)
  changed = false

  // noop
  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.flush()

  t.ok(!changed)
  changed = false

  // also noop
  await db.insert('@db/members', { id: 'maf2', age: 34 })
  await db.delete('@db/members', { id: 'maf2' })
  await db.flush()

  t.ok(!changed)
  changed = false

  await db.insert('@db/members', { id: 'maf3', age: 34 })
  await db.flush()

  t.ok(changed)

  await db.close()
  // hack due to hc releasing something slowly, fix there
  await new Promise((resolve) => setTimeout(resolve, 1000))
})

test('basic reopen', async function ({ create }, t) {
  const storage = await tmp(t)

  {
    const db = await create(definition, { storage })
    await db.insert('members', { id: 'maf', age: 34 })
    await db.flush()
    await db.close()
  }

  {
    const db = await create(definition, { storage })
    const all = await db.find('members').toArray()
    t.is(all.length, 1)
    await db.close()
  }
})

test('cork/uncork', async function ({ create }, t) {
  const db = await create()

  db.cork()
  const all = [
    db.insert('@db/members', { id: 'maf', age: 34 }),
    db.insert('@db/members', { id: 'andrew', age: 30 })
  ]
  db.uncork()

  await Promise.all(all)
  t.pass('did not crash')
  await db.close()
})

test('updates can be queryies', async function ({ create }, t) {
  const db = await create()

  t.is(db.updated(), false)

  await db.insert('@db/members', { id: 'maf', age: 50 })
  t.is(db.updated(), true)
  t.is(db.updated('@db/members', { id: 'maf' }), true)

  await db.insert('@db/members', { id: 'maf', age: 50 })
  t.is(db.updated(), true)
  t.is(db.updated('@db/members', { id: 'maf' }), true)

  await db.delete('@db/members', { id: 'maf' })
  t.is(db.updated(), false)
  t.is(db.updated('@db/members', { id: 'maf' }), false)

  await db.close()
})

test('changes', async function ({ create }, t) {
  const db = await create()

  if (!db.core) {
    t.comment('not supported on rocks')
    await db.close()
    return
  }

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.insert('@db/members', { id: 'andrew', age: 40 })
  await db.flush()

  let ops = []
  for await (const op of db.changes()) ops.push(op)

  t.alike(ops, [
    { type: 'insert', seq: 2, collection: '@db/members', value: { id: 'andrew', age: 40 } },
    { type: 'insert', seq: 4, collection: '@db/members', value: { id: 'maf', age: 50 } }
  ])

  await db.delete('@db/members', { id: 'andrew' })
  await db.flush()

  ops = []
  for await (const op of db.changes()) ops.push(op)

  t.alike(ops, [
    { type: 'insert', seq: 2, collection: '@db/members', value: { id: 'andrew', age: 40 } },
    { type: 'insert', seq: 4, collection: '@db/members', value: { id: 'maf', age: 50 } },
    { type: 'delete', seq: 6, collection: '@db/members', value: { id: 'andrew' } }
  ])

  ops = []
  for await (const op of db.changes({ gt: 4 })) ops.push(op)

  t.alike(ops, [{ type: 'delete', seq: 6, collection: '@db/members', value: { id: 'andrew' } }])

  await db.close()
})

test('update does not break existing snaps', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.insert('@db/members', { id: 'andrew', age: 40 })

  await db.flush()

  const ite = db.find('@db/members')

  db.update()

  const all = await ite.toArray()
  t.is(all.length, 2)

  await db.close()
})

test('nested keys', async function ({ create, bee }, t) {
  const db = await create({ fixture: 4 })

  await db.insert('@db/nested-members', { member: { id: 'maf', age: 50 }, fun: true })
  await db.insert('@db/nested-members', { member: { id: 'andrew', age: 40 }, fun: false })

  await db.flush()

  const all = await db.find('@db/nested-members').toArray()
  t.is(all.length, 2)

  const one = await db.get('@db/nested-members', { member: { id: 'maf' } })
  t.alike(one, { member: { id: 'maf', age: 50 }, fun: true })

  await db.delete('@db/nested-members', { member: { id: 'andrew' } })
  await db.flush()

  if (bee) {
    t.comment('only test changes feed on bee engine')

    const ops = []
    for await (const op of db.changes()) ops.push(op)

    t.alike(ops, [
      {
        type: 'insert',
        seq: 1,
        collection: '@db/nested-members',
        value: { member: { id: 'andrew', age: 40 }, fun: false }
      },
      {
        type: 'insert',
        seq: 2,
        collection: '@db/nested-members',
        value: { member: { id: 'maf', age: 50 }, fun: true }
      },
      {
        type: 'delete',
        seq: 3,
        collection: '@db/nested-members',
        value: { member: { id: 'andrew' } }
      }
    ])
  }

  await db.close()
})

test('undo mutation without deletion', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.flush()

  await db.insert('@db/members', { id: 'maf', age: 40 })
  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.flush()

  const maf = await db.findOne('@db/members')
  t.alike(maf, { id: 'maf', age: 50 })

  await db.close()
})

test('basic example with booleans', async function ({ create }, t) {
  const db = await create({ fixture: 5 })

  await db.insert('@db/members', { id: 'maf', present: true })
  await db.insert('@db/members', { id: 'andrew', present: false })
  await db.flush()

  {
    const result = await db
      .find('@db/members-by-present', { gte: { present: true }, lte: { present: true } })
      .toArray()
    t.alike(result, [{ id: 'maf', present: true }])
  }

  {
    const result = await db
      .find('@db/members-by-present', { gte: { present: false }, lte: { present: false } })
      .toArray()
    t.alike(result, [{ id: 'andrew', present: false }])
  }

  await db.close()
})

test('read tracing', async function ({ create }, t) {
  const db = await create({ trace })

  await db.insert('@db/members', { id: 'user1', age: 44 })
  await db.insert('@db/members', { id: 'user2', age: 50 })
  await db.insert('@db/members', { id: 'user3', age: 100 })
  await db.flush()

  const collections = new Set()
  const names = new Set()
  await db.find('@db/members').toArray()

  t.is(names.size, 3)
  t.is(collections.size, 1)
  t.ok(names.has('user1'))
  t.ok(names.has('user2'))
  t.ok(names.has('user3'))
  t.ok(collections.has('@db/members'))

  await db.close()

  function trace(collection, record) {
    collections.add(collection)
    names.add(record.id)
  }
})

test('no read tracing on transactions', async function ({ create }, t) {
  const db = await create({ trace })

  const collections = new Set()
  const names = new Set()

  {
    const tx = db.transaction()

    await tx.insert('@db/members', { id: 'user1', age: 44 })
    await tx.insert('@db/members', { id: 'user2', age: 50 })
    await tx.insert('@db/members', { id: 'user3', age: 100 })
    await tx.flush()
  }

  {
    const tx = db.transaction()
    await tx.find('@db/members').toArray()

    t.is(names.size, 0)
    t.is(collections.size, 0)

    await tx.close()
  }

  await db.close()

  function trace(collection, record) {
    collections.add(collection)
    names.add(record.id)
  }
})

test('exclusive transactions', async function ({ create }, t) {
  const db = await create()

  {
    const tx = await db.exclusiveTransaction()

    await tx.insert('@db/members', { id: 'user1', age: 44 })
    await tx.insert('@db/members', { id: 'user2', age: 50 })
    await tx.insert('@db/members', { id: 'user3', age: 100 })
    await tx.flush()
  }

  {
    const tx = await db.exclusiveTransaction()
    t.is((await tx.find('@db/members').toArray()).length, 3)

    await tx.close()
  }

  await db.close()
})

test('enum as key type', async function ({ create, bee }, t) {
  const db = await create({ fixture: 6 })
  const builder = require('./fixtures/generated/6/hyperschema')
  const { NotSpecified, Male, Female } = builder.getEnum('@db/gender')

  await db.insert('@db/members', { name: 'Doe', gender: NotSpecified })
  await db.insert('@db/members', { name: 'John', gender: Male })
  await db.insert('@db/members', { name: 'Jane', gender: Female })
  await db.flush()

  {
    const john = await db.get('@db/members', { name: 'John', gender: Male })
    t.alike(john, { name: 'John', gender: Male })
  }
  {
    const females = await db
      .find('@db/members-by-gender', { lte: { gender: Female }, gte: { gender: Female } })
      .toArray()
    t.alike(females, [{ name: 'Jane', gender: Female }])
  }

  await db.close()
})

test('array as key type', async function ({ create, bee }, t) {
  const db = await create({ fixture: 8 })

  await db.insert('@db/books', {
    title: 'Brave New World',
    tags: ['science fiction', 'dystopian', 'ficton']
  })
  await db.insert('@db/books', {
    title: 'Anathem',
    tags: ['science fiction', 'philosophy', 'math', 'ficton']
  })
  await db.flush()

  {
    const book = await db.get('@db/books', {
      title: 'Brave New World',
      tags: ['science fiction', 'dystopian', 'ficton']
    })
    t.alike(book, { title: 'Brave New World', tags: ['science fiction', 'dystopian', 'ficton'] })
  }
  {
    const distopianScifi = await db
      .find('@db/books-by-tag', {
        lte: { tags: ['science fiction', 'dystopian', 'ficton'] },
        gte: { tags: ['science fiction', 'dystopian', 'ficton'] }
      })
      .toArray()
    t.alike(distopianScifi, [
      { title: 'Brave New World', tags: ['science fiction', 'dystopian', 'ficton'] }
    ])
  }
  {
    const scifi = await db
      .find('@db/books-by-tag', {
        lte: { tags: ['science fiction', 'z', null, null] },
        gte: { tags: ['science fiction'] }
      })
      .toArray()
    t.alike(scifi, [
      { title: 'Brave New World', tags: ['science fiction', 'dystopian', 'ficton'] },
      { title: 'Anathem', tags: ['science fiction', 'philosophy', 'math', 'ficton'] }
    ])
  }

  await db.close()
})
