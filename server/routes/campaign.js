const express = require('express')
const { v4: uuidv4 } = require('uuid')
const scheduleController = require('../lib/ScheduleController')
const sendQueue = require('../lib/SendQueue')
const logger = require('../lib/Logger')
const { activeCampaigns, runCampaign, buildCfg } = require('../runner')
const router = express.Router()

module.exports = function (configStore) {
  function saveCampaign(campaign) {
    const campaigns = configStore.get('campaigns', {})
    campaigns[campaign.id] = { ...campaign, updatedAt: new Date().toISOString() }
    configStore.set('campaigns', campaigns)
  }

  // List all campaigns
  router.get('/', (req, res) => {
    const campaigns = configStore.get('campaigns', {})
    const list = Object.values(campaigns).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    res.json(list)
  })

  // Create campaign
  router.post('/', (req, res) => {
    const id = uuidv4()
    const campaign = {
      ...req.body,
      id,
      status: 'created',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    saveCampaign(campaign)
    res.json({ success: true, campaignId: id })
  })

  // Get single campaign
  router.get('/:id', (req, res) => {
    const campaign = configStore.get('campaigns', {})[req.params.id] || null
    res.json(campaign)
  })

  // Delete campaign
  router.delete('/:id', (req, res) => {
    const campaigns = configStore.get('campaigns', {})
    delete campaigns[req.params.id]
    configStore.set('campaigns', campaigns)
    sendQueue.clearQueue(req.params.id)
    logger.clearLogs(req.params.id)
    res.json({ success: true })
  })

  // Initialize send queue
  router.post('/:id/queue/init', (req, res) => {
    const { recipients, emailColumn } = req.body
    const queue = sendQueue.initQueue(req.params.id, recipients, emailColumn)
    res.json({ success: true, queue, stats: sendQueue.getStats(req.params.id) })
  })

  // Start campaign
  router.post('/:id/start', (req, res) => {
    const campaigns = configStore.get('campaigns', {})
    const campaign = campaigns[req.params.id]
    if (!campaign) return res.json({ success: false, error: 'Campaign not found' })

    const queue = sendQueue.getQueue(req.params.id)
    const pending = queue.filter(r => r.status === 'pending')
    if (pending.length > 0) {
      const times = scheduleController.calcSendTimes(pending.length, campaign.schedule)
      for (let i = 0; i < pending.length; i++) {
        sendQueue.updateStatus(req.params.id, pending[i].id, 'pending', {
          scheduledTime: times[i].toISOString()
        })
      }
    }

    campaign.status = 'running'
    saveCampaign(campaign)
    runCampaign(req.params.id, campaign, saveCampaign)
    res.json({ success: true })
  })

  // Pause campaign
  router.post('/:id/pause', (req, res) => {
    const ctx = activeCampaigns[req.params.id]
    if (ctx) {
      ctx.paused = true
      clearTimeout(ctx.timeout)
    }
    const campaigns = configStore.get('campaigns', {})
    if (campaigns[req.params.id]) {
      campaigns[req.params.id].status = 'paused'
      saveCampaign(campaigns[req.params.id])
    }
    res.json({ success: true })
  })

  // Resume campaign
  router.post('/:id/resume', (req, res) => {
    const campaigns = configStore.get('campaigns', {})
    const campaign = campaigns[req.params.id]
    if (!campaign) return res.json({ success: false, error: 'Campaign not found' })

    campaign.status = 'running'
    saveCampaign(campaign)

    const ctx = activeCampaigns[req.params.id]
    if (ctx) ctx.paused = false
    runCampaign(req.params.id, campaign, saveCampaign)
    res.json({ success: true })
  })

  // Stop campaign
  router.post('/:id/stop', (req, res) => {
    const ctx = activeCampaigns[req.params.id]
    if (ctx) {
      ctx.stopped = true
      clearTimeout(ctx.timeout)
      delete activeCampaigns[req.params.id]
    }
    const campaigns = configStore.get('campaigns', {})
    if (campaigns[req.params.id]) {
      campaigns[req.params.id].status = 'stopped'
      saveCampaign(campaigns[req.params.id])
    }
    res.json({ success: true })
  })

  // Update schedule
  router.put('/:id/schedule', (req, res) => {
    const { schedule } = req.body
    const campaigns = configStore.get('campaigns', {})
    const campaign = campaigns[req.params.id]
    if (!campaign) return res.json({ success: false, error: 'Campaign not found' })

    campaign.schedule = { ...campaign.schedule, ...schedule }
    saveCampaign(campaign)

    const ctx = activeCampaigns[req.params.id]
    if (ctx && !ctx.stopped) {
      const q = sendQueue.getQueue(req.params.id)
      const pending = q.filter(r => r.status === 'pending')
      if (pending.length > 0) {
        const times = scheduleController.calcSendTimes(pending.length, campaign.schedule)
        for (let i = 0; i < pending.length; i++) {
          sendQueue.updateStatus(req.params.id, pending[i].id, 'pending', {
            scheduledTime: times[i].toISOString()
          })
        }
      }
      ctx.cfg = buildCfg(campaign.schedule)
      clearTimeout(ctx.timeout)
      ctx.tick?.()
    }

    res.json({ success: true, campaign })
  })

  return router
}
