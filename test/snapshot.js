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

test('context-only options share the parent snapshot', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'a', age: 40 })
  await db.flush()

  const context = {}

  const snap = db.snapshot({ context })
  t.is(snap.context, context)
  t.is(snap.engineSnapshot, db.engineSnapshot, 'snapshot reuses the engine snapshot')
  t.absent('context' in snap.snapshotOptions, 'context is not an engine option')

  const tx = db.transaction({ context })
  t.is(tx.context, context)
  t.is(tx.engineSnapshot, db.engineSnapshot, 'transaction reuses the engine snapshot')
  t.absent('context' in tx.snapshotOptions, 'context is not an engine option')

  await snap.close()
  await tx.close()
  await db.close()
})

test('passing snapshot options works on every engine', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'a', age: 40 })
  await db.flush()

  const snap = db.snapshot({ timeout: 1000 })
  t.alike(await snap.get('@db/members', { id: 'a' }), { id: 'a', age: 40 })

  const tx = db.transaction({ timeout: 1000 })
  t.alike(await tx.get('@db/members', { id: 'a' }), { id: 'a', age: 40 })
  await tx.insert('@db/members', { id: 'b', age: 41 })
  await tx.flush()

  t.alike(await db.get('@db/members', { id: 'b' }), { id: 'b', age: 41 })

  await snap.close()
  await db.close()
})
