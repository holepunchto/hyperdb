exports.isDefinition = isDefinition
exports.compat = makeCompat

function makeCompat(definition) {
  if (definition.versions) return definition

  for (const c of definition.collections) {
    if (typeof c.version === 'number') continue
    const { encodeValue } = c
    c.encodeValue = function (schemaVersion, collectionVersion, record) {
      return encodeValue(schemaVersion, record)
    }
    c.version = 0
    c.decodedVersion = 0
  }

  for (const i of definition.indexes) {
    if (typeof i.version === 'number') continue
    i.version = 0
  }

  return {
    versions: { schema: definition.version, db: 0 },
    collections: definition.collections,
    indexes: definition.indexes,
    resolveCollection: definition.resolveCollection,
    resolveIndex: definition.resolveIndex
  }
}

function isDefinition(definition) {
  return !!(definition && typeof definition.resolveCollection === 'function')
}
