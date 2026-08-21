const { test } = require('./helpers')

test.bee2('diff - inserts, updates and deletes', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.insert('@db/members', { id: 'andrew', age: 40 })
  await db.insert('@db/members', { id: 'kasper', age: 30 })
  await db.flush()

  const from = db.engine.head()

  await db.insert('@db/members', { id: 'andrew', age: 41 })
  await db.insert('@db/members', { id: 'blake', age: 20 })
  await db.delete('@db/members', { id: 'kasper' })
  await db.flush()

  const diff = await toArray(db.diff('@db/members', { from }))

  t.alike(diff, [
    { left: { id: 'andrew', age: 40 }, right: { id: 'andrew', age: 41 } },
    { left: null, right: { id: 'blake', age: 20 } },
    { left: { id: 'kasper', age: 30 }, right: null }
  ])

  await db.close()
})

test.bee2('diff - no changes', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.flush()

  const from = db.engine.head()

  t.alike(await toArray(db.diff('@db/members', { from })), [])

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.flush()

  t.alike(await toArray(db.diff('@db/members', { from })), [])

  await db.close()
})

test.bee2('diff - defaults to the empty database', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.insert('@db/members', { id: 'andrew', age: 40 })
  await db.flush()

  const expected = [
    { left: null, right: { id: 'andrew', age: 40 } },
    { left: null, right: { id: 'maf', age: 50 } }
  ]

  t.alike(await toArray(db.diff('@db/members')), expected)
  t.alike(await toArray(db.diff('@db/members', { from: { key: null, length: 0 } })), expected)

  await db.close()
})

test.bee2('diff - range query', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  await db.insert('@db/members', { id: 'a', age: 1 })
  await db.insert('@db/members', { id: 'b', age: 2 })
  await db.insert('@db/members', { id: 'c', age: 3 })
  await db.flush()

  const from = db.engine.head()

  await db.insert('@db/members', { id: 'a', age: 11 })
  await db.insert('@db/members', { id: 'b', age: 22 })
  await db.insert('@db/members', { id: 'c', age: 33 })
  await db.flush()

  t.alike(await toArray(db.diff('@db/members', { from, gte: { id: 'b' } })), [
    { left: { id: 'b', age: 2 }, right: { id: 'b', age: 22 } },
    { left: { id: 'c', age: 3 }, right: { id: 'c', age: 33 } }
  ])

  t.alike(await toArray(db.diff('@db/members', { from, gt: { id: 'a' }, lt: { id: 'c' } })), [
    { left: { id: 'b', age: 2 }, right: { id: 'b', age: 22 } }
  ])

  t.alike(await toArray(db.diff('@db/members', { from, limit: 1 })), [
    { left: { id: 'a', age: 1 }, right: { id: 'a', age: 11 } }
  ])

  t.alike(await toArray(db.diff('@db/members', { from, limit: 0 })), [])

  await db.close()
})

test.bee2('diff - does not include index entries', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.flush()

  const from = db.engine.head()

  await db.insert('@db/members', { id: 'maf', age: 51 })
  await db.flush()

  t.alike(await toArray(db.diff('@db/members', { from })), [
    { left: { id: 'maf', age: 50 }, right: { id: 'maf', age: 51 } }
  ])

  await db.close()
})

test.bee2('diff - snapshot is not affected by later writes', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.flush()

  const from = db.engine.head()

  await db.insert('@db/members', { id: 'maf', age: 51 })
  await db.flush()

  const snap = db.snapshot()

  await db.insert('@db/members', { id: 'andrew', age: 40 })
  await db.flush()

  t.alike(await toArray(snap.diff('@db/members', { from })), [
    { left: { id: 'maf', age: 50 }, right: { id: 'maf', age: 51 } }
  ])

  t.alike(await toArray(db.diff('@db/members', { from })), [
    { left: null, right: { id: 'andrew', age: 40 } },
    { left: { id: 'maf', age: 50 }, right: { id: 'maf', age: 51 } }
  ])

  await snap.close()
  await db.close()
})

test.bee2('diff - unflushed updates are not included', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  await db.insert('@db/members', { id: 'maf', age: 50 })
  await db.flush()

  const from = db.engine.head()

  await db.insert('@db/members', { id: 'maf', age: 51 })

  t.alike(await toArray(db.diff('@db/members', { from })), [])

  await db.flush()

  t.alike(await toArray(db.diff('@db/members', { from })), [
    { left: { id: 'maf', age: 50 }, right: { id: 'maf', age: 51 } }
  ])

  await db.close()
})

test.bee2('diff - bad arguments', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  const from = db.engine.head()

  t.exception(() => db.diff('@db/nope', { from }), /Unknown collection/)
  t.exception(() => db.diff('@db/members-by-age', { from }), /Cannot diff an index/)
  t.exception(() => db.diff('@db/members', { from, reverse: true }), /Reverse diffs/)

  await db.close()
})

test.bee2('diff - closed db throws', async function ({ create }, t) {
  const db = await create()
  await db.ready()

  await db.close()

  t.exception(() => db.diff('@db/members'), /Hyperdb is closed/)
})

test.rocks('diff - not supported', async function ({ create }, t) {
  const db = await create()

  t.exception(() => db.diff('@db/members'), /Not supported/)

  await db.close()
})

test.bee('diff - not supported', async function ({ create }, t) {
  const db = await create()

  t.exception(() => db.diff('@db/members'), /Not supported/)

  await db.close()
})

async function toArray(stream) {
  const all = []
  for await (const data of stream) all.push(data)
  return all
}
