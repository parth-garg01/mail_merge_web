const scheduleController = require('./lib/ScheduleController')
const sendQueue = require('./lib/SendQueue')
const gmailClient = require('./lib/GmailClient')
const templateEngine = require('./lib/TemplateEngine')
const logger = require('./lib/Logger')

// WebSocket broadcast function — injected by server/index.js at startup
let _broadcast = null

function setBroadcast(fn) {
  _broadcast = fn
}

function notify(event, data) {
  if (_broadcast) _broadcast(event, data)
}

// campaignId -> { paused, stopped, timeout, cfg, tick }
const activeCampaigns = {}

function buildCfg(schedule) {
  return {
    allowedDays: schedule?.allowedDays || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    windowStart: schedule?.windowStart || '00:00',
    windowEnd: schedule?.windowEnd || '23:59',
    intervalMinutes: Number(schedule?.intervalMinutes) || 5,
    startAt: schedule?.startAt || null
  }
}

const TRANSIENT_CODES = new Set(['ENOTFOUND', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENETUNREACH', 'EAI_AGAIN'])

function isTransientError(err) {
  if (TRANSIENT_CODES.has(err.code)) return true
  const status = err?.response?.status || err?.status
  if (status >= 500 && status < 600) return true
  const msg = (err.message || '').toLowerCase()
  return msg.includes('network') || msg.includes('enotfound') || msg.includes('timeout') || msg.includes('socket hang up')
}

async function runCampaign(campaignId, campaign, saveCampaignFn) {
  if (!activeCampaigns[campaignId]) {
    activeCampaigns[campaignId] = { paused: false, stopped: false, timeout: null, cfg: null, tick: null }
  }
  const ctx = activeCampaigns[campaignId]
  ctx.cfg = buildCfg(campaign.schedule)

  const tick = async () => {
    if (ctx.stopped || ctx.paused) return

    const cfg = ctx.cfg

    if (!sendQueue.hasPending(campaignId)) {
      campaign.status = 'completed'
      saveCampaignFn(campaign)
      notify('campaign:complete', { campaignId })
      delete activeCampaigns[campaignId]
      return
    }

    const recipient = sendQueue.getNext(campaignId)
    if (!recipient) return

    if (recipient.scheduledTime) {
      const msUntil = new Date(recipient.scheduledTime) - Date.now()
      if (msUntil > 1000) {
        notify('campaign:nextSend', { campaignId, nextSendAt: new Date(recipient.scheduledTime).getTime() })
        notify('campaign:waiting', {
          campaignId,
          msToWait: msUntil,
          reason: `Scheduled for ${new Date(recipient.scheduledTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        })
        ctx.timeout = setTimeout(tick, Math.min(msUntil, 30000))
        return
      }
    } else {
      if (!scheduleController.isCampaignStartTimeReached(cfg.startAt)) {
        const msWait = scheduleController.msUntilStartTime(cfg.startAt)
        notify('campaign:waiting', { campaignId, msToWait: msWait, reason: 'Waiting for scheduled start' })
        ctx.timeout = setTimeout(tick, Math.min(msWait, 30000))
        return
      }
      if (!scheduleController.shouldSendNow(cfg)) {
        const msWait = scheduleController.msUntilNextValidWindow(cfg)
        notify('campaign:waiting', { campaignId, msToWait: msWait, reason: 'Outside sending window' })
        ctx.timeout = setTimeout(tick, Math.min(msWait, 60000))
        return
      }
    }

    const subject = templateEngine.merge(campaign.subjectTemplate || '', recipient.fields)
    const body = templateEngine.merge(campaign.bodyTemplate || '', recipient.fields)
    sendQueue.updateStatus(campaignId, recipient.id, 'sending')

    try {
      await gmailClient.send(recipient.email, subject, body)
      const updated = sendQueue.updateStatus(campaignId, recipient.id, 'sent', {
        sentAt: new Date().toISOString()
      })
      logger.log(campaignId, { email: recipient.email, subject, status: 'sent', errorMessage: null })
      notify('campaign:sent', { campaignId, recipient: updated, stats: sendQueue.getStats(campaignId) })

      const nextRecipient = sendQueue.getNext(campaignId)
      if (nextRecipient?.scheduledTime) {
        const msUntil = Math.max(1000, new Date(nextRecipient.scheduledTime) - Date.now())
        notify('campaign:nextSend', { campaignId, nextSendAt: new Date(nextRecipient.scheduledTime).getTime() })
        ctx.timeout = setTimeout(tick, Math.min(msUntil, 30000))
      } else {
        const intervalMs = scheduleController.addJitter(cfg.intervalMinutes * 60 * 1000)
        notify('campaign:nextSend', { campaignId, nextSendAt: Date.now() + intervalMs })
        ctx.timeout = setTimeout(tick, intervalMs)
      }
    } catch (err) {
      if (isTransientError(err)) {
        sendQueue.updateStatus(campaignId, recipient.id, 'pending')
        const retryMs = 2 * 60 * 1000
        notify('campaign:waiting', { campaignId, msToWait: retryMs, reason: 'No internet — will retry automatically' })
        ctx.timeout = setTimeout(tick, retryMs)
      } else {
        const updated = sendQueue.updateStatus(campaignId, recipient.id, 'failed', {
          errorMessage: err.message
        })
        logger.log(campaignId, { email: recipient.email, subject, status: 'failed', errorMessage: err.message })
        notify('campaign:failed', { campaignId, recipient: updated, error: err.message })

        const nextRecipient = sendQueue.getNext(campaignId)
        if (nextRecipient?.scheduledTime) {
          const msUntil = Math.max(1000, new Date(nextRecipient.scheduledTime) - Date.now())
          notify('campaign:nextSend', { campaignId, nextSendAt: new Date(nextRecipient.scheduledTime).getTime() })
          ctx.timeout = setTimeout(tick, Math.min(msUntil, 30000))
        } else {
          const intervalMs = scheduleController.addJitter(cfg.intervalMinutes * 60 * 1000)
          notify('campaign:nextSend', { campaignId, nextSendAt: Date.now() + intervalMs })
          ctx.timeout = setTimeout(tick, intervalMs)
        }
      }
    }
  }

  ctx.tick = tick
  tick()
}

module.exports = { activeCampaigns, runCampaign, setBroadcast, notify, buildCfg }
