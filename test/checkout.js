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

  const snapshot = db.engineSnapshot
  db.update()
  t.is(db.engineSnapshot, snapshot, 'current update reuses the snapshot')
  const ordinary = db.transaction()
  t.is(ordinary.engineSnapshot, snapshot, 'ordinary transaction reuses the snapshot')
  await ordinary.close()

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

test.bee2('snapshot options keep the parent position', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'a', age: 40 })
  await db.flush()

  // pending write on root, then a commit past it leaves root outdated
  await db.insert('@db/members', { id: 'p', age: 1 })
  const ahead = db.transaction()
  await ahead.insert('@db/members', { id: 'b', age: 41 })
  await ahead.flush()

  const snap = db.snapshot({ timeout: 100, wait: false })
  t.is(snap.engineSnapshot.snapshot.config.timeout, 100)
  t.is(snap.engineSnapshot.snapshot.config.wait, false)
  t.absent(await snap.get('@db/members', { id: 'b' }), 'stays at root position')

  const child = snap.snapshot({ timeout: 200 })
  t.is(child.engineSnapshot.snapshot.config.timeout, 200)
  t.is(child.engineSnapshot.snapshot.config.wait, false, 'inherits wait')

  const tx = db.transaction({ timeout: 100 })
  t.is(tx.updates.size, 0, 'drops stale pending writes')
  t.ok(await tx.get('@db/members', { id: 'b' }))
  t.is(tx.engineSnapshot.snapshot.config.timeout, 100, 'keeps options after update')

  await child.close()
  await snap.close()
  await tx.close()
  await db.close()
})
