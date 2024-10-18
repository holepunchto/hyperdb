const definition = require('./fixtures/definition')
const { test } = require('./helpers')
const tmp = require('test-tmp')

test('basic full example', async function ({ create }, t) {
  const db = await create(definition)

  await db.insert('members', { id: 'maf', age: 34 })
  await db.insert('members', { id: 'andrew', age: 34 })
  await db.insert('members', { id: 'anna', age: 32 })
  await db.flush()

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 34 }
    ])
  }

  // // stop lying
  await db.insert('members', { id: 'maf', age: 37 })

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 37 }
    ])
  }

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true }).toArray()
    t.alike(result, [
      { id: 'maf', age: 37 },
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('members').toArray()
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

test('delete record', async function ({ create }, t) {
  const db = await create(definition)

  await db.insert('members', { id: 'maf', age: 34 })
  await db.insert('members', { id: 'andrew', age: 34 })
  await db.flush()

  await db.delete('members', { id: 'maf' })

  {
    const result = await db.find('members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  await db.flush()

  {
    const result = await db.find('members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('members/by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  t.alike(await db.get('members', { id: 'maf' }), null)
  t.alike(await db.get('members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})

test('generated full example', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.insert('@db/members', { id: 'andrew', age: 34 })
  await db.insert('@db/members', { id: 'anna', age: 32 })
  await db.flush()

  {
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 34 }
    ])
  }

  // // stop lying
  await db.insert('@db/members', { id: 'maf', age: 37 })

  {
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 },
      { id: 'maf', age: 37 }
    ])
  }

  {
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }, { reverse: true }).toArray()
    t.alike(result, [
      { id: 'maf', age: 37 },
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('@db/members').toArray()
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

test('generated delete record', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.insert('@db/members', { id: 'andrew', age: 34 })
  await db.flush()

  await db.delete('@db/members', { id: 'maf' })

  {
    const result = await db.find('@db/members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  await db.flush()

  {
    const result = await db.find('@db/members').toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  {
    const result = await db.find('@db/members-by-age', { gte: { age: 33 }, lt: { age: 99 } }).toArray()
    t.alike(result, [
      { id: 'andrew', age: 34 }
    ])
  }

  t.alike(await db.get('@db/members', { id: 'maf' }), null)
  t.alike(await db.get('@db/members', { id: 'andrew' }), { id: 'andrew', age: 34 })

  await db.close()
})

test('delete from memview', async function ({ create }, t) {
  const db = await create()

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.delete('@db/members', { id: 'maf' })

  t.is(await db.get('@db/members', { id: 'maf' }), null)

  await db.close()
})

test('watch', async function ({ create }, t) {
  t.plan(4)

  const db = await create()

  let changed = false

  db.watch(function () {
    changed = true
  })

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.flush()

  t.ok(changed)
  changed = false

  // noop
  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.flush()

  t.ok(!changed)
  changed = false

  // also noop
  await db.insert('@db/members', { id: 'maf2', age: 34 })
  await db.delete('@db/members', { id: 'maf2' })
  await db.flush()

  t.ok(!changed)
  changed = false

  await db.insert('@db/members', { id: 'maf3', age: 34 })
  await db.flush()

  t.ok(changed)

  await db.close()
})

test('basic reopen', async function ({ create }, t) {
  const storage = await tmp(t)
  {
    const db = await create(definition, { storage })
    await db.insert('members', { id: 'maf', age: 34 })
    await db.flush()
    await db.close()
  }

  {
    const db = await create(definition, { storage })
    const all = await db.find('members').toArray()
    t.is(all.length, 1)
    await db.close()
  }
})
