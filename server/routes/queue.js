const express = require('express')
const scheduleController = require('../lib/ScheduleController')
const sendQueue = require('../lib/SendQueue')
const { activeCampaigns, runCampaign } = require('../runner')
const router = express.Router({ mergeParams: true })

module.exports = function (configStore) {
  function saveCampaign(campaign) {
    const campaigns = configStore.get('campaigns', {})
    campaigns[campaign.id] = { ...campaign, updatedAt: new Date().toISOString() }
    configStore.set('campaigns', campaigns)
  }

  router.get('/', (req, res) => {
    res.json(sendQueue.getQueue(req.params.id))
  })

  router.get('/stats', (req, res) => {
    res.json(sendQueue.getStats(req.params.id))
  })

  router.post('/:recipientId/skip', (req, res) => {
    sendQueue.updateStatus(req.params.id, req.params.recipientId, 'skipped', { errorMessage: 'Manually skipped' })
    res.json({ success: true })
  })

  router.post('/:recipientId/retry', (req, res) => {
    const result = sendQueue.retryFailed(req.params.id, req.params.recipientId)
    if (!result.success) return res.json(result)

    const campaigns = configStore.get('campaigns', {})
    const campaign = campaigns[req.params.id]

    if (campaign) {
      const [nextTime] = scheduleController.calcSendTimes(1, { ...campaign.schedule, startAt: '' })
      sendQueue.updateStatus(req.params.id, req.params.recipientId, 'pending', {
        scheduledTime: nextTime.toISOString()
      })
    }

    if (campaign && campaign.status !== 'running') {
      campaign.status = 'running'
      saveCampaign(campaign)
    }
    if (campaign && (!activeCampaigns[req.params.id] || activeCampaigns[req.params.id].stopped || activeCampaigns[req.params.id].paused)) {
      if (activeCampaigns[req.params.id]) {
        clearTimeout(activeCampaigns[req.params.id].timeout)
        delete activeCampaigns[req.params.id]
      }
      runCampaign(req.params.id, campaign, saveCampaign)
    }

    res.json({ ...result, stats: sendQueue.getStats(req.params.id) })
  })

  return router
}
