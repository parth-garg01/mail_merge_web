const fs = require('fs')
const path = require('path')
const { DATA_DIR } = require('./config')

class Store {
  constructor(name) {
    this._file = path.join(DATA_DIR, `${name}.json`)
    this._data = {}
    this._load()
  }

  _load() {
    try {
      if (fs.existsSync(this._file)) {
        this._data = JSON.parse(fs.readFileSync(this._file, 'utf8'))
      }
    } catch {
      this._data = {}
    }
  }

  _save() {
    fs.writeFileSync(this._file, JSON.stringify(this._data, null, 2))
  }

  get(key, defaultValue = undefined) {
    const parts = key.split('.')
    let cur = this._data
    for (const p of parts) {
      if (cur == null || typeof cur !== 'object') return defaultValue
      cur = cur[p]
    }
    return cur !== undefined ? cur : defaultValue
  }

  set(key, value) {
    const parts = key.split('.')
    let cur = this._data
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) {
        cur[parts[i]] = {}
      }
      cur = cur[parts[i]]
    }
    cur[parts[parts.length - 1]] = value
    this._save()
  }

  delete(key) {
    const parts = key.split('.')
    let cur = this._data
    for (let i = 0; i < parts.length - 1; i++) {
      if (!cur || !cur[parts[i]]) return
      cur = cur[parts[i]]
    }
    delete cur[parts[parts.length - 1]]
    this._save()
  }

  clear() {
    this._data = {}
    this._save()
  }
}

module.exports = Store
