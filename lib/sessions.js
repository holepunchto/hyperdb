module.exports = class SessionTracker {
  constructor () {
    this.sessions = []
  }

  get size () {
    return this.sessions.length
  }

  has (s) {
    return s.index < this.sessions.length && this.sessions[s.index] === s
  }

  add (s) {
    if (this.has(s)) return
    s.index = this.sessions.push(s) - 1
  }

  remove (s) {
    if (!this.has(s)) return

    const head = this.sessions.pop()
    if (head === s) return
    this.sessions[(head.index = s.index)] = head
  }

  close (skip) {
    const closing = []

    for (let i = this.sessions.length - 1; i >= 0; i--) {
      const s = this.sessions[i]
      if (s === skip) continue
      closing.push(s.close())
    }

    return Promise.all(closing)
  }
}
