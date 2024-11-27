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

#### `db = Hyperdb.bee(bee, definition, [options])`

Make a db backed by Hyperbee. P2P!

#### `db = Hyperdb.rocks(bee, definition, [options])`

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

See [example](./builder/example.js).

Each field in the builder file is an object:
```
{
  name: 'field-name',
  type: 'uint', // a compact-encoding type, or a reference to another encoding defined in the builder file
  required: true, // false for optional
  array: false // Store an array of 'type', instead of just one (default false)
}
```

## License

Apache-2.0
