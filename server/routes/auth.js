const express = require('express')
const crypto = require('crypto')
const router = express.Router()

function hashPwd(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex')
}

module.exports = function (configStore) {
  router.get('/status', (req, res) => {
    const hasPassword = !!configStore.get('appPasswordHash')
    res.json({ hasPassword, unlocked: req.session.unlocked || !hasPassword })
  })

  router.post('/unlock', (req, res) => {
    const { password } = req.body
    const stored = configStore.get('appPasswordHash')
    if (!stored) {
      req.session.unlocked = true
      return res.json({ success: true })
    }
    const ok = hashPwd(password) === stored
    if (ok) req.session.unlocked = true
    res.json({ success: ok })
  })

  router.post('/set-password', (req, res) => {
    const { currentPassword, newPassword } = req.body
    const stored = configStore.get('appPasswordHash')
    if (stored && hashPwd(currentPassword) !== stored) {
      return res.json({ success: false, error: 'Current password is incorrect.' })
    }
    if (!newPassword || newPassword.length < 4) {
      return res.json({ success: false, error: 'Password must be at least 4 characters.' })
    }
    configStore.set('appPasswordHash', hashPwd(newPassword))
    res.json({ success: true })
  })

  router.post('/remove-password', (req, res) => {
    const { currentPassword } = req.body
    const stored = configStore.get('appPasswordHash')
    if (!stored) return res.json({ success: true })
    if (hashPwd(currentPassword) !== stored) {
      return res.json({ success: false, error: 'Incorrect password.' })
    }
    configStore.delete('appPasswordHash')
    req.session.unlocked = false
    res.json({ success: true })
  })

  return router
}
