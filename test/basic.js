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
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true }).toArray()
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

test('delete record', async function ({ create }, t) {
  const db = await create(definition)

  await db.insert('members', { id: 'maf', age: 34 })
  await db.insert('members', { id: 'andrew', age: 34 })
  await db.flush()

  await db.delete('members', { id: 'maf' })

  {
    const result = await db.find('members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  await db.flush()

  {
    const result = await db.find('members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
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
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 34 }
    ])
  }

  // // stop lying
  await db.insert('@db/members', { id: 'maf', age: 37 })

  {
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 37 }
    ])
  }

  {
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true }).toArray()
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
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  await db.flush()

  {
    const result = await db.find('@db/members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
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
    { type: 'insert', seq: 2, collection: '@db/members', value: { id: 'maf', age: 50 } },
    { type: 'insert', seq: 4, collection: '@db/members', value: { id: 'andrew', age: 40 } }
  ])

  await db.delete('@db/members', { id: 'andrew' })
  await db.flush()

  ops = []
  for await (const op of db.changes()) ops.push(op)

  t.alike(ops, [
    { type: 'insert', seq: 2, collection: '@db/members', value: { id: 'maf', age: 50 } },
    { type: 'insert', seq: 4, collection: '@db/members', value: { id: 'andrew', age: 40 } },
    { type: 'delete', seq: 6, collection: '@db/members', value: { id: 'andrew' } }
  ])

  ops = []
  for await (const op of db.changes({ gt: 4 })) ops.push(op)

  t.alike(ops, [
    { type: 'delete', seq: 6, collection: '@db/members', value: { id: 'andrew' } }
  ])

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

    t.alike(ops, [{
      type: 'insert',
      seq: 1,
      collection: '@db/nested-members',
      value: { member: { id: 'maf', age: 50 }, fun: true }
    }, {
      type: 'insert',
      seq: 2,
      collection: '@db/nested-members',
      value: { member: { id: 'andrew', age: 40 }, fun: false }
    }, {
      type: 'delete',
      seq: 3,
      collection: '@db/nested-members',
      value: { member: { id: 'andrew' } }
    }])
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
