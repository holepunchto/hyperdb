function toChangesStream(stream, map) {
  const existingMap = stream._readableState.map
  stream._readableState.map = function (data) {
    let entry = data
    if (existingMap) {
      entry = existingMap(data)
      if (!entry) return null
    }

    return map(entry)
  }
  return stream
}

module.exports = toChangesStream
