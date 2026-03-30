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
