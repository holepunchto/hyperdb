const { test } = require('./helpers')

test.bee('basic checkouts', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 40 }])

  const checkout = db.core.length

  await db.insert('@db/members', { id: 'someone', age: 41 })

  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 41 }])
  t.alike(await db.find('@db/members', { checkout }).toArray(), [{ id: 'someone', age: 40 }])

  await db.flush()

  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 41 }])
  t.alike(await db.find('@db/members', { checkout }).toArray(), [{ id: 'someone', age: 40 }])

  await db.close()
})

test.bee2('basic checkouts', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 40 }])

  const checkout = db.engine.head()

  await db.insert('@db/members', { id: 'someone', age: 41 })

  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 41 }])
  t.alike(await db.find('@db/members', { checkout }).toArray(), [{ id: 'someone', age: 40 }])

  await db.flush()

  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 41 }])
  t.alike(await db.find('@db/members', { checkout }).toArray(), [{ id: 'someone', age: 40 }])

  await db.close()
})

test.bee2('empty checkout', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  const checkout = { key: null, length: 0 }

  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 40 }])
  t.alike(await db.find('@db/members', { checkout }).toArray(), [])

  await db.close()
})

test.bee2('checkout session', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'a', age: 40 })
  await db.flush()

  const session = db.session({ timeout: 100 })
  t.is(session.engineSnapshot.snapshot.config.timeout, 100)

  await db.insert('@db/members', { id: 'b', age: 41 })
  await db.flush()

  t.ok(await session.get('@db/members', { id: 'a' }))
  t.absent(await session.get('@db/members', { id: 'b' }))

  await session.insert('@db/members', { id: 'c', age: 42 })

  t.ok(await session.get('@db/members', { id: 'c' }))

  t.ok(await db.get('@db/members', { id: 'a' }))
  t.ok(await db.get('@db/members', { id: 'b' }))
  t.absent(await db.get('@db/members', { id: 'c' }))

  await session.close()
  await db.close()
})

test.bee2('checkout session timeout', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  // checking out a block that doesnt exist yet
  const session = db.session({ timeout: 100, length: db.core.length + 1 })

  await t.exception(session.get('@db/members', { id: 'a' }), /REQUEST_TIMEOUT/)

  await session.close()
  await db.close()
})
