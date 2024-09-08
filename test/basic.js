const HyperDB = require('../')
const definition = require('./fixtures/definition')
const generatedDefinition = require('./fixtures/generated')
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
    const result = await collect(db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 34 }
    ])
  }

  // // stop lying
  await db.insert('members', { id: 'maf', age: 37 })

  {
    const result = await collect(db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 37 }
    ])
  }

  {
    const result = await collect(db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true }))
    t.alike(result, [
      { id: 'maf', age: 37 },
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await collect(db.find('members'))
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

test('delete record', async function (t) {
  const db = HyperDB.rocksdb(await tmp(t), definition)

  await db.insert('members', { id: 'maf', age: 34 })
  await db.insert('members', { id: 'andrew', age: 34 })
  await db.flush()

  await db.delete('members', { id: 'maf' })

  {
    const result = await collect(db.find('members'))
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await collect(db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  await db.flush()

  {
    const result = await collect(db.find('members'))
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await collect(db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  t.alike(await db.get('members', { id: 'maf' }), null)
  t.alike(await db.get('members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})

test('generated full example on rocks', async function (t) {
  const db = HyperDB.rocksdb(await tmp(t), generatedDefinition)

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.insert('@db/members', { id: 'andrew', age: 34 })
  await db.insert('@db/members', { id: 'anna', age: 32 })
  await db.flush()

  {
    const result = await collect(db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 34 }
    ])
  }

  // // stop lying
  await db.insert('@db/members', { id: 'maf', age: 37 })

  {
    const result = await collect(db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 37 }
    ])
  }

  {
    const result = await collect(db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true }))
    t.alike(result, [
      { id: 'maf', age: 37 },
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await collect(db.find('@db/members'))
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'anna', age: 32 },
      { id: 'maf', age: 37 }
    ])
  }

  t.alike(await db.get('@db/members', { id: 'maf' }), { id: 'maf', age: 37 })
  t.alike(await db.get('@db/members', { id: 'anna' }), { id: 'anna', age: 32 })
  t.alike(await db.get('@db/members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})

test('generated delete record', async function (t) {
  const db = HyperDB.rocksdb(await tmp(t), generatedDefinition)

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.insert('@db/members', { id: 'andrew', age: 34 })
  await db.flush()

  await db.delete('@db/members', { id: 'maf' })

  {
    const result = await collect(db.find('@db/members'))
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await collect(db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  await db.flush()

  {
    const result = await collect(db.find('@db/members'))
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await collect(db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }))
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  t.alike(await db.get('@db/members', { id: 'maf' }), null)
  t.alike(await db.get('@db/members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})
