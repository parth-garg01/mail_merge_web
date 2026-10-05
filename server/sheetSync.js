const gmailClient = require('./lib/GmailClient')
const sheetParser = require('./lib/SheetParser')
const sendQueue = require('./lib/SendQueue')
const scheduleController = require('./lib/ScheduleController')
const runner = require('./runner')

// How often linked sheets are re-read for new rows
const POLL_MS = (Number(process.env.SHEET_SYNC_MINUTES) || 5) * 60 * 1000

let configStore = null

function saveCampaign(campaign) {
  const all = configStore.get('campaigns', {})
  all[campaign.id] = { ...campaign, updatedAt: new Date().toISOString() }
  configStore.set('campaigns', all)
}

// Re-reads the stored campaign so a pause or stop that landed mid-sync is kept
function patchCampaign(id, fields) {
  const all = configStore.get('campaigns', {})
  if (!all[id]) return
  all[id] = { ...all[id], ...fields }
  configStore.set('campaigns', all)
}

// Reads the campaign's Google Sheet and queues any rows it has not seen before
async function syncCampaign(id) {
  const campaign = configStore.get('campaigns', {})[id]
  if (!campaign?.sheetUrl) return { success: false, error: 'This campaign is not linked to a Google Sheet.' }

  try {
    const { values, sheetName } = await gmailClient.readSheet(sheetParser.parseSheetUrl(campaign.sheetUrl))
    const { headers, rows } = sheetParser.fromRows(values, sheetName)
    if (!headers.includes(campaign.emailColumn)) {
      throw new Error(`Column "${campaign.emailColumn}" is no longer in the sheet.`)
    }

    const scheduled = sendQueue.getQueue(id)
      .filter(r => r.status === 'pending' && r.scheduledTime)
      .map(r => new Date(r.scheduledTime).getTime())
    const added = sendQueue.appendNew(id, rows, campaign.emailColumn)

    if (added.length) {
      // New rows line up behind whatever is already scheduled
      const cfg = runner.buildCfg(campaign.schedule)
      if (scheduled.length) {
        cfg.startAt = new Date(Math.max(...scheduled) + cfg.intervalMinutes * 60 * 1000).toISOString()
      }
      const times = scheduleController.calcSendTimes(added.length, cfg)
      added.forEach((r, i) => sendQueue.updateStatus(id, r.id, 'pending', { scheduledTime: times[i].toISOString() }))

      const current = configStore.get('campaigns', {})[id]
      if (current?.status === 'running' && !runner.activeCampaigns[id]) {
        runner.runCampaign(id, current, saveCampaign)
      }
    }

    patchCampaign(id, { lastSyncAt: new Date().toISOString(), syncError: null })
    runner.notify('campaign:synced', { campaignId: id, added: added.length })
    return { success: true, added: added.length }
  } catch (err) {
    patchCampaign(id, { lastSyncAt: new Date().toISOString(), syncError: err.message })
    runner.notify('campaign:synced', { campaignId: id, added: 0, error: err.message })
    return { success: false, error: err.message }
  }
}

let busy = false

async function syncAll() {
  if (busy) return
  busy = true
  try {
    const campaigns = Object.values(configStore.get('campaigns', {}))
    for (const c of campaigns) {
      if (c.autoSync && c.sheetUrl && c.status === 'running') await syncCampaign(c.id)
    }
  } finally {
    busy = false
  }
}

function start(store) {
  configStore = store
  syncAll()
  setInterval(syncAll, POLL_MS).unref()
}

module.exports = { start, syncCampaign, saveCampaign }
