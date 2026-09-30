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

test.bee2('transaction discards dry-run writes', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'a', age: 40 })
  await db.flush()

  const tx = db.transaction({ timeout: 100 })
  t.is(tx.engineSnapshot.snapshot.config.timeout, 100)

  await db.insert('@db/members', { id: 'b', age: 41 })
  await db.flush()

  t.ok(await tx.get('@db/members', { id: 'a' }))
  t.absent(await tx.get('@db/members', { id: 'b' }))

  await tx.insert('@db/members', { id: 'c', age: 42 })

  t.ok(await tx.get('@db/members', { id: 'c' }))

  t.ok(await db.get('@db/members', { id: 'a' }))
  t.ok(await db.get('@db/members', { id: 'b' }))
  t.absent(await db.get('@db/members', { id: 'c' }))

  await tx.close()
  await db.close()
})

test.bee2('transaction timeout', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  // unavailable block will trigger timeout
  db.db.move({ length: db.core.length + 1 })
  const tx = db.transaction({ timeout: 100 })

  await t.exception(tx.get('@db/members', { id: 'a' }), /REQUEST_TIMEOUT/)

  await tx.close()
  await db.close()
})
