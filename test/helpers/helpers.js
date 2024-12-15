exports.mapTeenager = (record, context) => {
  if (record.age < 13 || record.age > 19) return []
  return [record.age]
}

exports.mapNameToLowerCase = (record, context) => {
  const name = record.name.toLowerCase().trim()
  return name ? [name] : []
}

exports.triggerCountMembers = async (db, key, record) => {
  const digest = (await db.get('@example/digest')) || { count: 0 }

  const prev = !!(await db.get('@example/members', key))
  const next = !!record

  if (prev === next) return

  digest.count += next ? 1 : -1

  await db.insert('@example/digest', digest)
}
