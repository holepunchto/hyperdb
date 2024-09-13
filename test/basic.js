const definition = require('./fixtures/definition')
const test = require('brittle')
const { rocks } = require('./helpers')

test('basic full example on rocks', async function (t) {
  const db = await rocks(t, definition)

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

test('delete record', async function (t) {
  const db = await rocks(t, definition)

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

test('generated full example on rocks', async function (t) {
  const db = await rocks(t)

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

test('generated delete record', async function (t) {
  const db = await rocks(t)

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

test('delete from memview', async function (t) {
  const db = await rocks(t)

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.delete('@db/members', { id: 'maf' })

  t.is(await db.get('@db/members', { id: 'maf' }), null)

  await db.close()
})

test('watch', async function (t) {
  t.plan(4)

  const db = await rocks(t)

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

test('stats', async function (t) {
  const db = await rocks(t, { fixture: 2 })

  await db.insert('@db/members', { id: 'maf', age: 34 })
  await db.insert('@db/members', { id: 'andrew', age: 34 })
  await db.insert('@db/members', { id: 'anna', age: 32 })

  {
    const st = await db.stats('@db/members')
    t.is(st.count, 3)
  }

  await db.flush()

  {
    const st = await db.stats('@db/members')
    t.is(st.count, 3)
  }

  await db.delete('@db/members', { id: 'anna', age: 32 })

  {
    const st = await db.stats('@db/members')
    t.is(st.count, 2)
  }

  await db.insert('@db/members', { id: 'maf', age: 35 })

  {
    const st = await db.stats('@db/members')
    t.is(st.count, 2)
  }

  await db.close()
})
