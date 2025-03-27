# hyperdb

Database built for P2P and local indexing

```
npm install hyperdb
```

## Usage

First generate your definition with the builder.
The definition defines the schemas and collections you wanna use.

```js
// TODO (see ./example here for now)
```

Then boot your db. You can use the same definition for a fully local db and a P2P one.

``` js
const HyperDB = require('hyperdb')

// first choose your engine
const db = HyperDB.rocks('./my-rocks.db', require('./my-definition'))
```

It is that simple.

## API

#### `db = Hyperdb.bee(hypercore, definition, [options])`

Make a db backed by Hyperbee. P2P!

#### `db = Hyperdb.rocks(path, definition, [options])`

Make a db backed by RocksDB. Local only!

#### `queryStream = db.find(collectionOrIndex, query, [options])`

Query the database. `collectionOrIndex` is the identifier you defined in your builder.

The query looks like this

``` js
{
  gt: { ... },
  gte: { ... },
  lt: { ...},
  lte: { ...}
}
```

And options include

```js
{
  limit, // how many max?
  reverse // reverse stream?
}
```

See the basic tests for an easy example on how queries look like.

The `queryStream` is a streamx readable stream that yields the documents you search for.

A query is always running on a snapshot, meaning any inserts/deletes you do while this is running
will not impact the query stream itself.

#### `all = await queryStream.toArray()`

Stream helper to simply get all the remaining entries in the stream.

#### `one = await queryStream.one()`

Stream helper to simply get the last entry in the stream.

#### `doc = await db.findOne(collectionOrIndex, query, [options])`

Alias for `await find(...).one()`

#### `doc = await db.get(collection, query)`

Get a document from a collection

#### `{ count } = await db.stats(collectionOrIndex)`

Get stats, about a collection or index with stats enabled.

#### `await db.insert(collection, doc)`

Insert a document into a collection. NOTE: you have to flush the db later for this to be persisted.

#### `await db.delete(collection, query)`

Delete a document from a collection. NOTE: you have to flush the db later for this to be persisted.

#### `bool = db.updated([collection], [query])`

Returns a boolean indicating if this database was updated. Pass a collection and doc query to know if
a specific record was updated.

#### `await db.flush()`

Flush all changes to the db

#### `db.reload()`

Reload the internal snapshot. Clears the memory state.

#### `db = db.snapshot()`

Make a readonly snapshot of the database. All reads/streams are locked in time on a snapshot from the time you call the snapshot method.

#### `db = db.transaction()`

Make a writable snapshot of the database. All reads/streams are locked in time on a snapshot from the time you call the snapshot method.
When you flush this one, it updates the main instance also.

#### `await db.close()`

Close the database. You have to close any snapshots you use also.

## Builder API

We can define what the schema of collections and the documents they contain using the builder API. A common pattern is to create a `build.js` script that is run whenever the database schema changes. See the [example](./builder/example/example.js).

The builder API can be imported via the `builder` subpath:

```js
const HyperdbBuilder = require('hyperdb/builder')
```

#### `const db = HyperdbBuilder.from(SCHEMA_DIR, DB_DIR)`

Load a builder instance `db` with the `hyperschema` definitions (aka `SCHEMA_DIR`) and with existing `hyperdb` definitions (aka `DB_DIR`).

`SCHEMA_DIR` is either the `hyperschema` definition object or the directory path to load from disk.

`DB_DIR` is either the existing database definition as a object or the directory path to load from disk.

#### `HyperdbBuilder.toDisk(db, DB_DIR, opts = { esm: false })`

Persist the builder instance `db` to the path passed as `DB_DIR`. If `DB_DIR` is falsy, the builder will use the `db.dbDir` path from `db`. This method is usually called at the end of the `build.js` script.

If the `esm` option is set to true, the code generated will be an ESM module.

#### `const namespacedDb = db.namespace(namespace)`

Create a namespaced db for defining multiple sets of database definitions on one database.

#### `db.require(path)`

Load helper functions to be used in the database as callbacks for collection triggers and index maps.

### Collections

#### `db.collections.register(description)`

Register collection with the `description`.

A `description` has the following form:

```
{
  name: 'collection-name',
  schema: '@schema-ns/struct-name', // identifier for the collections schema
  key?: ['keyField1', 'keyField2'], // the definition of the primary key to lookup collection entries
  derived?: false, // Whether it is derived collection and so shouldnt be versioned
  trigger?: 'triggerFunctionName' // A function loaded via `db.require()` to run when a collection document is updated
}
```

Elements in the `key` array should go from least to most specific, but often contain only one field that uniquely identifies the collection entry. Keys can use a 'dot notation' to specify nested properties of the collection entry's struct, for example:

```js
// Hyperschema
const dbSchema = schema.namespace('db')
dbSchema.register({
  name: 'foo',
  fields: [{ name: 'id', type: 'string', required: true }]
})

dbSchema.register({
  name: 'nested',
  fields: [
    { name: 'foo', type: '@db/foo', required: true }, // nested struct
    { name: 'bar', type: 'bool' }
  ]
})

// Hyperdb Builder
const db = HyperdbBuilder.from(SCHEMA_DIR, DB_DIR)
db.collections.register({
  name: 'nested-foo',
  schema: '@db/nested',
  key: ['foo.id'] // uses `foo`'s `id` property as the key
})
```

`trigger` is a callback run when an entry is modified and can be used to update other entries in the database. The callback should be registered via `db.require(path)` and should have the following function signature:

```js
async function triggerCallback (db, query, record) {}
```

Trigger callback arguments:
- `db` is the `hyperdb` instance.
- `query` is the query being used to update the database. In the case of `db.insert()` the `query` is the document being inserted.
- `record` is the document being inserted, if `null` the document matching `query` is being deleted.

A trigger that counts the number of members (a collection named `@example/member`) and stores them as the collection `@example/member-info` could be implemented like this:

```js
exports.triggerCount = async (db, query, record) => {
  const info = (await db.get('@example/member-info')) || { count: 0 }
  const existing = await db.get('@example/member', query)
  if (existing && record) return // The record is being updated

  await db.insert('@example/member-info', { count: record ? info.count + 1 : info.count - 1 })
}
```

`@example/member-info` should be a collection with `derived` set to `true` since it is derived from other collections.

### Indexes

#### `db.indexes.register(description)`

Register an index with the given `description`.

A `description` has the following form:

```
{
  name: 'index-name',
  collection: '@ns/collection', // The collection the index is a lookup into.
  unique: false, // whether index keys are unique, aka only return one document
  key: ['other-field'] || {
    type: 'string', // Key schema type
    map: 'indexMapFunctionName' // The function name (registered via db.require()) to map over the collection w/ to create the index
  }
}
```

If `unique` is `false`, the primary key of the document will be added to the index key to ensure entries do not clobber one another.

##### Key Mapping

Indexes support defining `key` as an array of fields just like Collections, but also support a mapping callback to derive keys from indexed entries. This callback has the following function signature:

```js
function keyMap (record, context): Array<any> {}
```

The return type of the mapping callback is always an array but the type of the elements in that array are defined as a `hyperschema` type with the `type` property like so:

```js
// helpers.js
exports.keyMap = (record, context) => [
  { name: record.name, age: record.age }
]

// schema.js
// ... Defining db, it's collections
db.register('./helpers.js')
db.indexes.register({
  name: 'mapped-index',
  collection: '@ns/collection',
  key: {
    type: { // a struct
      fields: [
        {
          name: 'name',
          type: 'string'
        },
        {
          name: 'age',
          type: 'uint'
        }
      ]
    },
    map: 'keyMap' // the callback name from helpers.js
  }
})
```

## License

Apache-2.0
