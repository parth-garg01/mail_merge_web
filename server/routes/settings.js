const express = require('express')
const gmailClient = require('../lib/GmailClient')
const { REDIRECT_URI } = require('../config')
const router = express.Router()

module.exports = function (configStore) {
  const clientId = () => configStore.get('googleClientId', process.env.GOOGLE_CLIENT_ID || '')
  const clientSecret = () => configStore.get('googleClientSecret', process.env.GOOGLE_CLIENT_SECRET || '')

  router.get('/', (req, res) => {
    res.json({
      defaultInterval: 5,
      defaultWindowStart: '08:00',
      defaultWindowEnd: '15:00',
      defaultAllowedDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      ...configStore.get('settings', {}),
      googleClientId: clientId(),
      // The secret never goes back to the browser, only whether one is saved
      googleClientSecret: '',
      hasGoogleClientSecret: !!clientSecret(),
      redirectUri: REDIRECT_URI
    })
  })

  router.post('/', (req, res) => {
    const { googleClientId, googleClientSecret, hasGoogleClientSecret, redirectUri, ...settings } = req.body
    configStore.set('settings', settings)
    if (googleClientId) configStore.set('googleClientId', googleClientId)
    if (googleClientSecret) configStore.set('googleClientSecret', googleClientSecret)
    if (clientId() && clientSecret()) gmailClient.init(clientId(), clientSecret())
    res.json({ success: true })
  })

  return router
}
