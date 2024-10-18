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
    ? (dir, ...args) => HyperDB.rocks(dir, ...args)
    : (dir, ...args) => HyperDB.bee(new Hypercore(dir), ...args)

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
        const ctx = { type, create, build }
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
    })

    return db
  }
}

function builder (t, create) {
  return async function (builder) {
    const dir = await tmp(t, { dir: path.join(__dirname, '../fixtures/tmp') })
    await builder(Builder, Hyperschema, { db: path.join(dir, 'hyperdb'), schema: path.join(dir, 'hyperschema') })
    return create(path.join(dir, 'db'), require(path.join(dir, 'hyperdb')))
  }
}
