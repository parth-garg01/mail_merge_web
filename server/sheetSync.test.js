const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

// Keep test data out of the real app data directory
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mmw-test-'))
const Store = require('./store')
const gmailClient = require('./lib/GmailClient')
const sendQueue = require('./lib/SendQueue')
const sheetSync = require('./sheetSync')

const store = new Store('app-config')
const schedule = { windowStart: '00:00', windowEnd: '23:59', intervalMinutes: 10, allowedDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] }
let sheet = [['Email', 'Name'], ['a@x.com', 'A']]
gmailClient.readSheet = async () => ({ values: sheet, sheetName: 'Sheet1' })

test('sync queues only new rows and schedules them after the existing ones', async () => {
  // Paused, so the sender is not started and nothing is emailed
  store.set('campaigns', {
    c1: { id: 'c1', status: 'paused', emailColumn: 'Email', schedule, autoSync: true, sheetUrl: 'https://docs.google.com/spreadsheets/d/abc/edit' }
  })
  sheetSync.start(store)

  const [first] = sendQueue.initQueue('c1', [{ _rowIndex: 1, Email: 'a@x.com', Name: 'A' }], 'Email')
  const firstAt = Date.now() + 60 * 60 * 1000
  sendQueue.updateStatus('c1', first.id, 'pending', { scheduledTime: new Date(firstAt).toISOString() })

  assert.deepStrictEqual(await sheetSync.syncCampaign('c1'), { success: true, added: 0 })

  sheet = [...sheet, ['b@x.com', 'B'], ['c@x.com', 'C']]
  assert.deepStrictEqual(await sheetSync.syncCampaign('c1'), { success: true, added: 2 })

  const times = sendQueue.getQueue('c1').map(r => new Date(r.scheduledTime).getTime())
  assert.deepStrictEqual(times, [firstAt, firstAt + 600000, firstAt + 1200000])
  assert.strictEqual(store.get('campaigns').c1.syncError, null)
})

test('a renamed email column is reported instead of silently syncing nothing', async () => {
  sheet = [['Mail'], ['d@x.com']]
  const result = await sheetSync.syncCampaign('c1')
  assert.strictEqual(result.success, false)
  assert.match(store.get('campaigns').c1.syncError, /no longer in the sheet/)
})
