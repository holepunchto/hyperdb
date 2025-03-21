exports.mapStruct = (record, context) => [
  { name: record.name, age: record.age }
]

exports.triggerCollection = async (db, key, isDelete, context) => {
  const info = (await db.get('@example/collection1-info')) || { count: 0 }
  const existing = await db.get('@example/collection1', key)
  if (existing && !isDelete) return
  await db.insert('@example/collection1-info', { count: isDelete ? info.count - 1 : info.count + 1 })
}
