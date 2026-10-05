const express = require('express')
const gmailClient = require('../lib/GmailClient')
const router = express.Router()

module.exports = function (configStore) {
  router.get('/', (req, res) => {
    res.json({
      defaultInterval: 5,
      defaultWindowStart: '08:00',
      defaultWindowEnd: '15:00',
      defaultAllowedDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      googleClientId: configStore.get('googleClientId', ''),
      googleClientSecret: configStore.get('googleClientSecret', ''),
      ...configStore.get('settings', {})
    })
  })

  router.post('/', (req, res) => {
    const settings = req.body
    configStore.set('settings', settings)
    if (settings.googleClientId && settings.googleClientSecret) {
      configStore.set('googleClientId', settings.googleClientId)
      configStore.set('googleClientSecret', settings.googleClientSecret)
      gmailClient.init(settings.googleClientId, settings.googleClientSecret)
    }
    res.json({ success: true })
  })

  return router
}
