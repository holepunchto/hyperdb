import HyperDB from '../index.js'
import def from '../test/fixtures/schema/1/hyperdb/index.js'

const db = HyperDB.rocks('./test.db', def)

console.time('boot')
const oldest = await db.findOne('@db/members-by-age', { reverse: true })
console.timeEnd('boot')

let i = oldest ? oldest.age + 1 : 0

while (i < 10_000_000) {
  console.time('inserting')
  const all = []
  for (let j = 0; j < 25_000; j++) {
    all.push(db.insert('@db/members', { id: 'person-' + i, age: i }))
    i++
  }
  await Promise.all(all)
  console.timeEnd('inserting')
  console.time('flushing')
  await db.flush()
  console.timeEnd('flushing')
  console.log('total:', i)
}

await timeQuery('10k members-by-age', '@db/members-by-age', { gt: { age: 90_000 }, limit: 10_000 })
await timeQuery('10 members-by-age', '@db/members-by-age', { limit: 10 })
await timeQuery('10k members', '@db/members', { limit: 10_000 })
await timeQuery('last 10 members', '@db/members', { limit: 10, reverse: true })

function timeQuery (label, index, query) {
  console.time(label)
  return new Promise((resolve) => {
    db.find(index, query)
      .on('end', () => console.timeEnd(label))
      .on('close', resolve)
      .resume()
  })
}
