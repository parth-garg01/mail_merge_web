const express = require('express')
const gmailClient = require('../lib/GmailClient')
const router = express.Router()

module.exports = function (configStore) {
  router.get('/status', (req, res) => {
    res.json({
      authenticated: gmailClient.isAuthenticated(),
      email: gmailClient.getConnectedEmail()
    })
  })

  // Returns the Google OAuth URL — the client redirects the browser there
  router.get('/auth-url', (req, res) => {
    try {
      const url = gmailClient.getAuthUrl()
      res.json({ url })
    } catch (err) {
      res.json({ error: err.message })
    }
  })

  router.post('/revoke', async (req, res) => {
    await gmailClient.revokeToken()
    res.json({ success: true })
  })

  router.post('/credentials', (req, res) => {
    const { clientId, clientSecret } = req.body
    // A blank secret means "keep the saved one"
    if (clientId) configStore.set('googleClientId', clientId)
    if (clientSecret) configStore.set('googleClientSecret', clientSecret)
    const id = configStore.get('googleClientId', process.env.GOOGLE_CLIENT_ID || '')
    const secret = configStore.get('googleClientSecret', process.env.GOOGLE_CLIENT_SECRET || '')
    if (!id || !secret) return res.json({ success: false, error: 'Client ID and secret are both required.' })
    gmailClient.init(id, secret)
    res.json({ success: true })
  })

  return router
}
