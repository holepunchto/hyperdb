const brittle = require('brittle')
const tmp = require('test-tmp')
const path = require('path')
const Hyperschema = require('hyperschema')
const Hypercore = require('hypercore')
const Builder = require('../../builder')
const HyperDB = require('../../')

const rocksTest = createTester('rocks')
const beeTest = createTester('bee')

exports.test = test
exports.replicate = replicate

// solo just runs the rocks
test.solo = rocksTest.solo

test.skip = function (name, fn) {
  rocksTest.skip(name, fn)
  beeTest.skip(name, fn)
}

test.rocks = rocksTest
test.bee = beeTest

function test (name, fn) {
  rocksTest(name, fn)
  beeTest(name, fn)
}

function createTester (type) {
  const make = type === 'rocks'
    ? (dir, def, opts = {}) => HyperDB.rocks(dir, def, opts)
    : (dir, def, opts = {}) => HyperDB.bee(new Hypercore(dir, opts.key), def, opts)

  const test = runner(brittle)

  test.solo = runner(brittle.solo)
  test.skip = runner(brittle.skip)

  return test

  function runner (run) {
    return function (name, fn) {
      const id = type + ' - ' + name

      return run(id, function (t) {
        const create = creator(t, make)
        const build = builder(t, make)
        const ctx = { type, create, build, bee: type !== 'rocks' }
        return fn(ctx, t)
      })
    }
  }
}

function creator (t, createHyperDB) {
  return async function fromDefinition (def, opts = {}) {
    if (!HyperDB.isDefinition(def)) {
      return fromDefinition(require(`../fixtures/generated/${(def && def.fixture) || 1}/hyperdb`), def)
    }

    const db = createHyperDB(opts.storage || await tmp(t), def, opts)
    const engine = db.engine

    // just to help catch leaks
    t.teardown(function () {
      if (!engine.closed) throw new Error('Test has a leak, engine did not close')
    }, { order: Infinity })

    return db
  }
}

function builder (t, create) {
  return async function (builder) {
    const dir = await tmp(t, { dir: path.join(__dirname, '../fixtures/tmp') })
    await builder(Builder, Hyperschema, { db: path.join(dir, 'hyperdb'), schema: path.join(dir, 'hyperschema'), helpers: path.join(__dirname, 'helpers.js') })
    return create(path.join(dir, 'db'), require(path.join(dir, 'hyperdb')))
  }
}

function replicate (t, a, b) {
  const s1 = a.core.replicate(true)
  const s2 = b.core.replicate(false)

  s1.pipe(s2).pipe(s1)

  t.teardown(() => Promise.all([destroy(s1), destroy(s2)]))

  function destroy (s) {
    if (s.destroyed) return
    return new Promise(resolve => {
      s.on('error', noop)
      s.on('close', resolve)
      s.destroy()
    })
  }
}

function noop () {}
