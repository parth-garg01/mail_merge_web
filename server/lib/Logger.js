const fs = require('fs')
const path = require('path')
const os = require('os')

const LOGS_DIR = path.join(os.homedir(), '.smart-mail-merger-web', 'logs')
fs.mkdirSync(LOGS_DIR, { recursive: true })

class Logger {
  _logPath(campaignId) {
    return path.join(LOGS_DIR, `campaign-${campaignId}.json`)
  }

  log(campaignId, entry) {
    const p = this._logPath(campaignId)
    let entries = []
    if (fs.existsSync(p)) {
      try { entries = JSON.parse(fs.readFileSync(p, 'utf8')) } catch {}
    }
    entries.push({ ...entry, timestamp: new Date().toISOString() })
    fs.writeFileSync(p, JSON.stringify(entries, null, 2))
  }

  getLogs(campaignId) {
    const p = this._logPath(campaignId)
    if (!fs.existsSync(p)) return []
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return [] }
  }

  exportCSVData(campaignId) {
    const logs = this.getLogs(campaignId)
    if (!logs.length) return null

    const cols = ['timestamp', 'email', 'subject', 'status', 'errorMessage']
    const escape = v => `"${String(v || '').replace(/"/g, '""')}"`
    return [
      cols.join(','),
      ...logs.map(l => cols.map(c => escape(l[c])).join(','))
    ].join('\n')
  }

  clearLogs(campaignId) {
    const p = this._logPath(campaignId)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
}

module.exports = new Logger()
