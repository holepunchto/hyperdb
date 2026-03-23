function toChangesStream(stream, map) {
  const existingMap = stream._readableState.map
  stream._readableState.map = function (data) {
    let entry = data
    if (existingMap) {
      entry = existingMap(data)
      if (!entry) return null
    }

    const mapped = map(entry)
    if (!mapped) return null
    return mapped
  }
  return stream
}

module.exports = toChangesStream
