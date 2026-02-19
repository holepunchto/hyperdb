const brittle = require('brittle')
const tmp = require('test-tmp')
const path = require('path')
const Hyperschema = require('hyperschema')
const Hypercore = require('hypercore')
const Corestore = require('corestore')
const Builder = require('../../builder')
const HyperDB = require('../../')

const rocksTest = createTester('rocks')
const beeTest = createTester('bee')
const bee2Test = createTester('bee2')

exports.test = test
exports.replicate = replicate

// solo just runs the rocks
test.solo = function (name, opts, fn) {
  if (typeof opts === 'function') return test.solo(name, {}, opts)
  if (opts.bee === true) return beeTest.solo(name, fn)
  if (opts.bee2 === true) return bee2Test.solo(name, fn)
  return rocksTest.solo(name, fn)
}

test.skip = function (...args) {
  rocksTest.skip(...args)
  beeTest.skip(...args)
  bee2Test.skip(...args)
}

test.rocks = rocksTest
test.bee = beeTest
test.bee2 = bee2Test

function test(name, opts, fn) {
  if (typeof opts === 'function') return test(name, {}, opts)
  if (!opts) opts = {}
  if (opts.rocks !== false) rocksTest(name, fn)
  if (opts.bee !== false) beeTest(name, fn)
  if (opts.bee2 !== false) bee2Test(name, fn)
}

function createTester(type) {
  const make =
    type === 'rocks'
      ? (dir, def, opts = {}) => HyperDB.rocks(dir, def, opts)
      : type === 'bee'
        ? (dir, def, opts = {}) => HyperDB.bee(new Hypercore(dir, opts.key), def, opts)
        : (dir, def, opts = {}) => HyperDB.bee2(new Corestore(dir), def, opts)

  const test = runner(brittle)

  test.solo = runner(brittle.solo)
  test.skip = runner(brittle.skip)

  return test

  function runner(run) {
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

function creator(t, createHyperDB) {
  return async function fromDefinition(def, opts = {}) {
    if (!HyperDB.isDefinition(def)) {
      return fromDefinition(
        require(`../fixtures/generated/${(def && def.fixture) || 1}/hyperdb`),
        def
      )
    }

    const db = createHyperDB(opts.storage || (await tmp(t)), def, opts)
    const engine = db.engine

    // just to help catch leaks
    t.teardown(
      function () {
        if (!engine.closed) throw new Error('Test has a leak, engine did not close')
      },
      { order: Infinity }
    )

    return db
  }
}

function builder(t, create) {
  return async function (builder, opts = {}) {
    const dir = opts.dir || (await tmp(t, { dir: path.join(__dirname, '../fixtures/tmp') }))
    await builder(Builder, Hyperschema, {
      db: path.join(dir, 'hyperdb'),
      schema: path.join(dir, 'hyperschema'),
      helpers: path.join(__dirname, 'helpers.js')
    })
    const id = path.join(dir, 'hyperdb')
    try {
      delete require.cache[require.resolve(id)]
    } catch {}
    return create(path.join(dir, 'db'), require(id))
  }
}

function replicate(t, a, b) {
  let destroying = null

  const s1 = a.core.replicate(true)
  const s2 = b.core.replicate(false)

  s1.pipe(s2).pipe(s1)

  t.teardown(teardown)

  return teardown

  function destroy(s) {
    if (s.destroyed) return
    return new Promise((resolve) => {
      s.on('error', noop)
      s.on('close', resolve)
      s.destroy()
    })
  }

  function teardown() {
    if (!destroying) destroying = Promise.all([destroy(s1), destroy(s2)])
    return destroying
  }
}

function noop() {}
