const b4a = require('b4a')
const definition = require('./fixtures/definition')
const { test, replicate } = require('./helpers')

test.bee('basic extension test', async function ({ create }, t) {
  t.plan(6)
  const db = await create(definition)

  await db.insert('members', { id: 'user', age: 1 })
  await db.insert('members', { id: 'user2', age: 2 })
  await db.insert('members', { id: 'user3', age: 3 })
  await db.flush()

  const clone = await create(definition, { key: db.core.key })
  clone.core.on('append', () => clone.update())

  replicate(t, clone, db)

  await waitLengthMatch(db.core, clone.core)

  let q = null
  {
    const og = clone.extension.get.bind(clone.extension)
    clone.extension.get = (version, collectionName, range, query) => {
      q = query
      t.is(collectionName, 'members')
      t.absent(range)
      t.ok(query)
      og(version, collectionName, range, query)
    }
  }

  {
    const og = db.extension.onget.bind(db.extension)
    db.extension.onget = (message, from) => {
      t.ok(b4a.equals(message.query, q))
      t.is(message.collectionName, 'members')
      og(message, from)
    }
  }

  await db.insert('members', { id: 'user4', age: 3 })
  await db.flush()
  await waitLengthMatch(db.core, clone.core)

  t.ok(await clone.get('members', { id: 'user4' }))

  t.teardown(async () => {
    await db.close()
    await clone.close()
  })
})

test.bee('basic extension range test', async function ({ create }, t) {
  t.plan(9)
  const db = await create(definition)

  await db.insert('members', { id: 'user', age: 1 })
  await db.insert('members', { id: 'user2', age: 2 })
  await db.insert('members', { id: 'user3', age: 3 })
  await db.flush()

  const clone = await create(definition, { key: db.core.key })
  clone.core.on('append', () => clone.update())

  replicate(t, clone, db)

  await waitLengthMatch(db.core, clone.core)

  let r = null
  {
    const og = clone.extension.get.bind(clone.extension)
    clone.extension.get = (version, collectionName, range, query) => {
      r = range
      t.is(collectionName, 'members/by-age')
      t.ok(range)
      t.absent(query)
      og(version, collectionName, range, query)
    }
  }

  {
    const og = db.extension.onget.bind(db.extension)
    db.extension.onget = (message, from) => {
      t.ok(b4a.equals(message.range.gte, r.gte))
      t.ok(b4a.equals(message.range.lte, r.lte))
      t.ok(message.range.reverse === r.reverse)
      t.ok(message.range.limit === r.limit)
      t.is(message.collectionName, 'members/by-age')
      og(message, from)
    }
  }

  await db.insert('members', { id: 'user4', age: 3 })
  await db.flush()
  await waitLengthMatch(db.core, clone.core)

  const arr = await clone.find('members/by-age', { gte: { age: 1 }, lte: { age: 3 } }).toArray()
  t.is(arr.length, 4)

  t.teardown(async () => {
    await db.close()
    await clone.close()
  })
})

async function waitLengthMatch (a, b) {
  while (a.length !== b.length) await new Promise(resolve => setTimeout(resolve, 100))
}
