const { test } = require('./helpers')

test('update nested', async function ({ create }, t) {
  const db = await create({ fixture: 7 })
  const builder = require('./fixtures/generated/7/hyperschema')
  const { NotSpecified } = builder.getEnum('@db/gender')

  await db.insert('@db/members', {
    name: 'John',
    gender: NotSpecified
  })
  await db.flush()

  {
    const john = await db.get('@db/members', { name: 'John' })
    t.alike(john, { name: 'John', gender: NotSpecified, birth: null })
  }

  await db.insert('@db/members', {
    name: 'John',
    gender: NotSpecified,
    birth: {
      year: 1993
    }
  })
  await db.flush()

  {
    const john = await db.get('@db/members', { name: 'John' })
    t.alike(john, {
      name: 'John',
      gender: NotSpecified,
      birth: {
        year: 1993
      }
    })
  }

  await db.close()
})
