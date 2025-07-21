const { test, replicate } = require('./helpers')

test.bee('updates are explicit per default', async function ({ create }, t) {
  t.plan(6)

  const db = await create()

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

test.bee('can auto update', async function ({ create }, t) {
  t.plan(4)

  const db = await create()

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

test.bee('auto update but writable', async function ({ create }, t) {
  const db = await create({ autoUpdate: true })

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

test.bee.solo('requests are cleared on close', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  const clone = await create({ key: db.core.key, autoUpdate: true })

  t.alike(clone.core.key, db.core.key)

  const unreplicate = replicate(t, clone, db)

  await new Promise(resolve => clone.core.once('append', resolve))

  await unreplicate()

  const members = clone.get('@db/members', { id: 'someone' })
  const cancelled = t.exception(members, /REQUEST_CANCELLED/)

  await new Promise(resolve => setTimeout(resolve, 10))

  await clone.close()

  await cancelled

  t.teardown(async () => {
    await db.close()
    await clone.close()
  })
})
