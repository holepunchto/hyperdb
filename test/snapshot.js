const { test } = require('./helpers')

test('basic snapshot', async function ({ create }, t) {
  const db = await create()

  const empty = db.snapshot()

  t.alike(await empty.find('@db/members').toArray(), [])

  await db.insert('@db/members', { id: 'someone', age: 40 })

  t.alike(await empty.find('@db/members').toArray(), [])
  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 40 }])

  await db.flush()

  t.is(db.updated(), false)

  t.alike(await empty.find('@db/members').toArray(), [])
  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 40 }])

  const snap = db.snapshot()

  await db.insert('@db/members', { id: 'someone', age: 41 })

  t.alike(await empty.find('@db/members').toArray(), [])
  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 41 }])
  t.alike(await snap.find('@db/members').toArray(), [{ id: 'someone', age: 40 }])

  await db.flush()

  t.alike(await empty.find('@db/members').toArray(), [])
  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 41 }])
  t.alike(await snap.find('@db/members').toArray(), [{ id: 'someone', age: 40 }])

  await empty.close()

  t.alike(await db.find('@db/members').toArray(), [{ id: 'someone', age: 41 }])
  t.alike(await snap.find('@db/members').toArray(), [{ id: 'someone', age: 40 }])

  t.alike(await snap.find('@db/members').toArray(), [{ id: 'someone', age: 40 }])

  await snap.close()
  await db.close()
})

test('snap of snap', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.insert('@db/members', { id: 'else', age: 50 })

  const snap = db.snapshot()
  const snapOfSnap = snap.snapshot()

  await db.insert('@db/members', { id: 'baby', age: 1 })

  t.alike(await snap.find('@db/members').toArray(), [
    { id: 'else', age: 50 },
    { id: 'someone', age: 40 }
  ])
  t.alike(await snapOfSnap.find('@db/members').toArray(), [
    { id: 'else', age: 50 },
    { id: 'someone', age: 40 }
  ])

  await snapOfSnap.close()

  t.alike(await snap.find('@db/members').toArray(), [
    { id: 'else', age: 50 },
    { id: 'someone', age: 40 }
  ])

  await db.flush()

  t.alike(await snap.find('@db/members').toArray(), [
    { id: 'else', age: 50 },
    { id: 'someone', age: 40 }
  ])
  t.alike(await db.find('@db/members').toArray(), [
    { id: 'baby', age: 1 },
    { id: 'else', age: 50 },
    { id: 'someone', age: 40 }
  ])

  await snap.close()

  t.alike(await db.find('@db/members').toArray(), [
    { id: 'baby', age: 1 },
    { id: 'else', age: 50 },
    { id: 'someone', age: 40 }
  ])

  await db.close()
})

test('a divergent tx should not clear the memview', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'someone', age: 40 })
  await db.flush()

  {
    const tx = db.transaction()
    await tx.insert('@db/members', { id: 'else', age: 50 })
    await tx.flush()
  }

  const all = await db.find('@db/members').toArray()
  t.is(all.length, 2)

  await db.close()
})

test('root close waits for snapshot closes', async function ({ create }, t) {
  const db = await create()

  const snap = db.snapshot()
  const snapOfSnap = snap.snapshot()

  await db.close()

  t.ok(snap.closed)
  t.ok(snapOfSnap.closed)
})
