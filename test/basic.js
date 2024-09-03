const HyperDB = require('../')
const definition = require('./fixtures/definition')
const tmp = require('test-tmp')
const test = require('brittle')
const { collect } = require('./helpers')

test('basic full example on rocks', async function (t) {
  const db = HyperDB.rocksdb(await tmp(t), definition)

  await db.insert('members', { id: 'maf', age: 34 })
  await db.insert('members', { id: 'andrew', age: 34 })
  await db.insert('members', { id: 'anna', age: 32 })
  await db.flush()

  {
    const result = await collect(db.query('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 34 }
    ])
  }

  // // stop lying
  await db.insert('members', { id: 'maf', age: 37 })

  {
    const result = await collect(db.query('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 37 }
    ])
  }

  {
    const result = await collect(db.query('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true }))
    t.alike(result, [
      { id: 'maf', age: 37 },
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await collect(db.query('members'))
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'anna', age: 32 },
      { id: 'maf', age: 37 }
    ])
  }

  t.alike(await db.get('members', { id: 'maf' }), { id: 'maf', age: 37 })
  t.alike(await db.get('members', { id: 'anna' }), { id: 'anna', age: 32 })
  t.alike(await db.get('members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})