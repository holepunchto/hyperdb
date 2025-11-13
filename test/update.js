const { test } = require('./helpers')

test('update nested', async function ({ create, bee }, t) {
  const db = await create({ fixture: 7 })
  const builder = require('./fixtures/generated/7/hyperschema')
  const { Male } = builder.getEnum('@db/gender')

  await db.insert('@db/members', {
    name: 'John',
    gender: Male
  })
  await db.flush()

  {
    const john = await db.get('@db/members', { name: 'John' })
    t.alike(john, { name: 'John', gender: Male, birth: null })
  }

  await db.insert('@db/members', {
    name: 'John',
    gender: Male,
    birth: {
      year: 1993
    }
  })
  await db.flush()

  {
    const john = await db.get('@db/members', { name: 'John' })
    t.alike(john, {
      name: 'John',
      gender: Male,
      birth: {
        year: 1993
      }
    })
  }

  await db.close()
})
