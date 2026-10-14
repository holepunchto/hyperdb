const { test, replicate } = require('./helpers')

test('updates are explicit per default', async function ({ create }, t) {
  const db = await create()
  if (!db.core) {
    t.comment('not supported on rocks')
    await db.close()
    return
  }

  t.plan(6)

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  const clone = await create({ key: db.core.key })

  clone.core.once('append', async function () {
    {
      const members = await clone.find('@db/members').toArray()

      t.alike(members, [])
      t.is(members.length, 0)
    }

    clone.update()

    {
      const members = await clone.find('@db/members').toArray()
      const expected = await db.find('@db/members').toArray()

      t.alike(members, expected)
      t.is(members.length, 2)
    }
  })

  t.alike(clone.core.key, db.core.key)

  {
    const tx = db.transaction()
    await tx.insert('@db/members', { id: 'else', age: 50 })
    await tx.flush()
  }

  const all = await db.find('@db/members').toArray()
  t.is(all.length, 2)

  replicate(t, clone, db)

  t.teardown(async () => {
    await db.close()
    await clone.close()
  })
})

test('can auto update', async function ({ create }, t) {
  const db = await create()
  if (!db.core) {
    t.comment('not supported on rocks')
    await db.close()
    return
  }
  t.plan(4)

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  const clone = await create({ key: db.core.key, autoUpdate: true })

  clone.watch(async function () {
    const members = await clone.find('@db/members').toArray()
    const expected = await db.find('@db/members').toArray()

    t.alike(members, expected)
    t.is(members.length, 2)
  })

  t.alike(clone.core.key, db.core.key)

  {
    const tx = db.transaction()
    await tx.insert('@db/members', { id: 'else', age: 50 })
    await tx.flush()
  }

  const all = await db.find('@db/members').toArray()
  t.is(all.length, 2)

  replicate(t, clone, db)

  t.teardown(async () => {
    await db.close()
    await clone.close()
  })
})

test('auto update but writable', async function ({ create }, t) {
  const db = await create({ autoUpdate: true })
  if (!db.core) {
    t.comment('not supported on rocks')
    await db.close()
    return
  }

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  const tx = db.transaction()
  await tx.insert('@db/members', { id: 'someone', age: 41 })
  await tx.insert('@db/members', { id: 'someone else', age: 41 })
  await tx.flush()

  const list = await db.find('@db/members').toArray()

  t.alike(list, [
    { id: 'someone', age: 41 },
    { id: 'someone else', age: 41 }
  ])

  await db.close()
})

test('requests are cleared on close', async function ({ create }, t) {
  const db = await create()
  if (!db.core) {
    t.comment('not supported on rocks')
    await db.close()
    return
  }

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  const clone = await create({ key: db.core.key, autoUpdate: true })

  t.alike(clone.core.key, db.core.key)

  const unreplicate = replicate(t, clone, db)

  await new Promise((resolve) => clone.core.once('append', resolve))

  await unreplicate()

  const members = clone.get('@db/members', { id: 'someone' })
  const cancelled = t.exception(members, /REQUEST_CANCELLED/)

  await new Promise((resolve) => setTimeout(resolve, 10))

  await clone.close()

  await cancelled

  t.teardown(async () => {
    await db.close()
    await clone.close()
  })
})

test('requests are cleared on close from unclosed snap', async function ({ create }, t) {
  const db = await create()
  if (!db.core) {
    t.comment('not supported on rocks')
    await db.close()
    return
  }

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  const clone = await create({ key: db.core.key, autoUpdate: true })

  t.alike(clone.core.key, db.core.key)

  const unreplicate = replicate(t, clone, db)

  await new Promise((resolve) => clone.core.once('append', resolve))

  await unreplicate()

  const snap = clone.snapshot()
  const members = snap.get('@db/members', { id: 'someone' })
  const cancelled = t.exception(members, /REQUEST_CANCELLED/)

  await new Promise((resolve) => setTimeout(resolve, 10))

  await clone.close()

  await cancelled

  t.teardown(async () => {
    await db.close()
    await clone.close()
  })
})

test(
  'download makes the db readable offline',
  { rocks: false, bee: false },
  async function ({ create }, t) {
    const db = await create()

    const tx = db.transaction()
    for (let i = 0; i < 100; i++) {
      await tx.insert('@db/members', { id: 'member-' + i, age: 20 + (i % 50) })
    }
    await tx.flush()

    const expected = await db.find('@db/members').toArray()
    t.is(expected.length, 100)

    const clone = await create({ key: db.core.key, autoUpdate: true })

    const unreplicate = replicate(t, clone, db)

    await new Promise((resolve) => clone.core.once('append', resolve))

    await clone.download()
    await unreplicate()

    // every read must be served locally now, no peers connected
    const members = await clone.find('@db/members').toArray()
    t.alike(members, expected)

    const one = await clone.get('@db/members', { id: 'member-42' })
    t.alike(one, { id: 'member-42', age: 62 })

    const range = await clone.find('@db/members', { gte: { id: 'member-9' } }).toArray()
    t.is(range.length, 11)

    await clone.close()
    await db.close()
  }
)

test('download is a no-op on engines without it', { bee2: false }, async function ({ create }, t) {
  const db = await create()
  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  await db.download()

  t.alike(await db.get('@db/members', { id: 'someone' }), { id: 'someone', age: 40 })

  await db.close()
})
