const HyperDB = require('../../')
const tmp = require('test-tmp')

exports.rocks = async function (t, def, opts) {
  if (!HyperDB.isDefinition(def)) return exports.rocks(t, require('../fixtures/generated'), def)

  const db = HyperDB.rocksdb(await tmp(t), def, opts)
  const engine = db.engine

  // just to help catch leaks
  t.teardown(function () {
    if (!engine.closed) throw new Error('Test has a leak, engine did not close')
  })

  return db
}
