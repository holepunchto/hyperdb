const { test, replicate } = require('./helpers')

test.bee('updates are explicit per default', async function ({ create }, t) {
  t.plan(4)

  const db = await create()

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  const clone = await create({ key: db.core.key })

  clone.core.once('append', async function () {
    clone.update()

    const members = await clone.find('@db/members').toArray()
    const expected = await db.find('@db/members').toArray()

    t.alike(members, expected)
    t.is(members.length, 2)
  })

  t.alike(clone.core.key, db.core.key)
  replicate(t, clone, db)

  {
    const tx = db.transaction()
    await tx.insert('@db/members', { id: 'else', age: 50 })
    await tx.flush()
  }

  const all = await db.find('@db/members').toArray()
  t.is(all.length, 2)

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
  replicate(t, clone, db)

  {
    const tx = db.transaction()
    await tx.insert('@db/members', { id: 'else', age: 50 })
    await tx.flush()
  }

  const all = await db.find('@db/members').toArray()
  t.is(all.length, 2)

  t.teardown(async () => {
    await db.close()
    await clone.close()
  })
})
