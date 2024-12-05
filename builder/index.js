const p = require('path')
const fs = require('fs')
const Hyperschema = require('hyperschema')

const generateCode = require('./codegen')

const COLLECTION_TYPE = 1
const INDEX_TYPE = 2

const DB_JSON_FILE_NAME = 'db.json'
const CODE_FILE_NAME = 'index.js'
const MESSAGES_FILE_NAME = 'messages.js'

class DBType {
  constructor (builder, namespace, description) {
    this.builder = builder
    this.namespace = namespace
    this.description = description
    this.fqn = getFQN(this.namespace, this.description.name)
    this.key = description.key
    this.fullKey = []

    this.isMapped = false
    this.isIndex = false
    this.isCollection = false

    const { prefix, id } = this.builder._assignId(this)
    this.prefix = prefix
    this.id = id

    this.version = 1
    this.previous = null
    if (this.builder.previous) {
      this.previous = this.builder.previous.typesById.get(this.id)
    }
  }

  _resolveKey (schema, path) {
    const components = path.split('.')

    let current = schema
    for (let i = 0; i < components.length; i++) {
      const field = current.fieldsByName.get(components[i])
      if (!field) throw new Error('Could not resolve path: ' + path)
      current = field.type
    }

    const resolved = this.builder.schema.resolve(current.fqn, { aliases: false })
    if (!resolved) throw new Error('Could not resolve path: ' + path)

    return resolved
  }

  toJSON () {
    return {
      name: this.description.name,
      unsafe: this.description.unsafe,
      namespace: this.namespace,
      id: this.id
    }
  }
}

class Collection extends DBType {
  constructor (builder, namespace, description) {
    super(builder, namespace, description)
    this.isCollection = true
    this.derived = !!description.derived
    this.indexes = []

    this.schema = this.builder.schema.resolve(description.schema)
    if (!this.schema) throw new Error('Schema not found: ' + description.schema)

    this.key = description.key || []
    this.fullKey = this.key
    this.trigger = (typeof description.trigger === 'function') ? description.trigger.toString() : (description.trigger || null)

    this.keyEncoding = []
    this.valueEncoding = this.fqn + '/value'
    if (this.key.length) {
      for (const component of this.key) {
        const field = this.schema.fieldsByName.get(component)
        if (!field) throw new Error('Field not found: ' + component)
        const resolvedType = this.builder.schema.resolve(field.type.fqn, { aliases: false })
        this.keyEncoding.push(resolvedType.name)
      }
    }

    // Register a value encoding type (the portion of the record that will not be in the primary key)
    const primaryKeySet = new Set(this.key)
    this.builder.schema.register({
      ...this.schema.toJSON(),
      derived: true,
      flagsPosition: -1,
      namespace: this.namespace,
      name: this.description.name + '/value',
      fields: this.schema.fields.filter(f => !primaryKeySet.has(f.name)).map(f => f.toJSON())
    })
  }

  toJSON () {
    return {
      ...super.toJSON(),
      type: COLLECTION_TYPE,
      indexes: this.indexes.map(i => i.fqn),
      schema: this.schema.fqn,
      derived: this.derived,
      key: this.key,
      trigger: this.trigger
    }
  }
}

class Index extends DBType {
  constructor (builder, namespace, description) {
    super(builder, namespace, description)
    this.isIndex = true
    this.unique = !!description.unique
    this.isMapped = !Array.isArray(description.key)

    this.collection = this.builder.typesByName.get(description.collection)
    this.keyEncoding = []

    if (!this.collection || !this.collection.isCollection) {
      throw new Error('Invalid index target: ' + description.collection)
    }

    this.collection.indexes.push(this)

    this.key = description.key
    this.fullKey = null
    this.indexKey = null

    this.map = null
    if (this.isMapped) {
      this.map = (typeof this.key.map === 'function') ? this.key.map.toString() : this.key.map
    }

    // Key encoding will be an IndexEncoder of the secondary index's key fields
    // If an Array is provided, the keys are intepreted as fields from the source collection
    // This can be overridden by providing { type, map } options to the key field
    if (Array.isArray(this.key)) {
      this.fullKey = [...this.key]
      for (const component of this.key) {
        const resolvedType = this._resolveKey(this.collection.schema, component)
        this.keyEncoding.push(resolvedType.name)
      }
    } else if (typeof this.key.type === 'string') {
      const resolvedType = this.builder.schema.resolve(this.key.type, { aliases: false })
      this.fullKey = [null] // null implies no name, ie primitive
      this.keyEncoding.push(resolvedType.name)
    } else {
      this.fullKey = []
      for (const field of this.key.type.fields) {
        const resolvedType = this.builder.schema.resolve(field.type, { aliases: false })
        this.keyEncoding.push(resolvedType.name)
        this.fullKey.push(field.name)
      }
    }

    this.indexKey = this.fullKey.slice(0)

    // If the key is not unique, then the primary key should also be included
    if (!this.unique) {
      for (let i = 0; i < this.collection.keyEncoding.length; i++) {
        this.keyEncoding.push(this.collection.keyEncoding[i])
        this.fullKey.push(this.collection.key[i])
      }
    }
  }

  toJSON () {
    return {
      ...super.toJSON(),
      type: INDEX_TYPE,
      collection: this.description.collection,
      unique: this.unique,
      key: Array.isArray(this.key)
        ? this.key
        : {
            type: this.key.type,
            map: (typeof this.key.map === 'function') ? this.key.map.toString() : this.key.map
          }
    }
  }
}

class BuilderCollections {
  constructor (namespace) {
    this.builder = namespace.builder
    this.namespace = namespace
  }

  register (description) {
    this.builder.registerCollection(description, this.namespace.name)
  }
}

class BuilderIndexes {
  constructor (namespace) {
    this.builder = namespace.builder
    this.namespace = namespace
  }

  register (description) {
    this.builder.registerIndex(description, this.namespace.name)
  }
}

class BuilderNamespace {
  constructor (builder, name, { prefix = [] } = {}) {
    this.builder = builder
    this.name = name
    this.prefix = prefix

    this.collections = new BuilderCollections(this)
    this.indexes = new BuilderIndexes(this)

    this.descriptions = []
  }

  toJSON () {
    return {
      name: this.name,
      prefix: this.prefix
    }
  }
}

class Builder {
  constructor (schema, dbJson, { offset, dbDir = null, schemaDir = null } = {}) {
    this.schema = schema
    this.version = dbJson ? dbJson.version : 0
    this.offset = dbJson ? dbJson.offset : (offset || 0)
    this.dbDir = dbDir
    this.schemaDir = schemaDir

    this.namespaces = new Map()
    this.typesByName = new Map()
    this.typesById = new Map()
    this.orderedTypes = []

    this.currentOffset = this.offset

    this.initializing = true
    if (dbJson) {
      for (let i = 0; i < dbJson.schema.length; i++) {
        const description = dbJson.schema[i]
        if (description.type === COLLECTION_TYPE) {
          this.registerCollection(description, description.namespace)
        } else {
          this.registerIndex(description, description.namespace)
        }
      }
    }
    this.initializing = false
  }

  _assignId (type) {
    const unsafe = type.description.unsafe
    if (unsafe) {
      if (unsafe.prefix && !Number.isInteger(unsafe.id)) {
        throw new Error('If a type overrides a prefix, it must also specifiy an ID')
      }
      if (unsafe.prefix) return { id: unsafe.id, prefix: unsafe.prefix }
    }
    return { id: this.currentOffset++, prefix: null }
  }

  registerCollection (description, namespace) {
    const fqn = getFQN(namespace, description.name)
    // TODO: also validate this for invalid mutations if it was hydrated from JSON
    if (this.typesByName.has(fqn)) return

    const collection = new Collection(this, namespace, description)

    this.orderedTypes.push(collection)
    this.typesByName.set(collection.fqn, collection)
  }

  registerIndex (description, namespace) {
    const fqn = getFQN(namespace, description.name)
    // TODO: also validate this for invalid mutations if it was hydrated from JSON
    if (this.typesByName.has(fqn)) return

    const index = new Index(this, namespace, description)

    this.orderedTypes.push(index)
    this.typesByName.set(index.fqn, index)
  }

  namespace (name, opts) {
    if (this.namespaces.has(name)) throw new Error('Namespace already exists: ' + name)
    const ns = new BuilderNamespace(this, name, opts)
    this.namespaces.set(name, ns)
    return ns
  }

  toJSON () {
    return {
      version: this.version,
      offset: this.offset,
      schema: this.orderedTypes.map(t => t.toJSON())
    }
  }

  static toDisk (hyperdb, dbDir) {
    if (!dbDir) dbDir = hyperdb.dbDir
    fs.mkdirSync(dbDir, { recursive: true })

    const messagesPath = p.join(p.resolve(dbDir), MESSAGES_FILE_NAME)
    const dbJsonPath = p.join(p.resolve(dbDir), DB_JSON_FILE_NAME)
    const codePath = p.join(p.resolve(dbDir), CODE_FILE_NAME)

    fs.writeFileSync(messagesPath, hyperdb.schema.toCode(), { encoding: 'utf-8' })
    fs.writeFileSync(dbJsonPath, JSON.stringify(hyperdb.toJSON(), null, 2), { encoding: 'utf-8' })
    fs.writeFileSync(codePath, generateCode(hyperdb), { encoding: 'utf-8' })
  }

  static from (schemaJson, dbJson, opts) {
    const schema = Hyperschema.from(schemaJson)
    if (typeof dbJson === 'string') {
      const jsonFilePath = p.join(p.resolve(dbJson), DB_JSON_FILE_NAME)
      let exists = false
      try {
        fs.statSync(jsonFilePath)
        exists = true
      } catch (err) {
        if (err.code !== 'ENOENT') throw err
      }
      opts = { ...opts, dbDir: dbJson, schemaDir: schemaJson }
      if (exists) return new this(schema, JSON.parse(fs.readFileSync(jsonFilePath)), opts)
      return new this(schema, null, opts)
    }
    return new this(schema, dbJson, opts)
  }
}

module.exports = Builder

function getFQN (namespace, name) {
  if (namespace === null) return name
  return '@' + namespace + '/' + name
}
