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
    configStore.set('googleClientId', clientId)
    configStore.set('googleClientSecret', clientSecret)
    const redirectUri = process.env.REDIRECT_URI || 'http://localhost:5000/oauth2callback'
    gmailClient.init(clientId, clientSecret, redirectUri)
    res.json({ success: true })
  })

  return router
}
