const express = require('express')
const crypto = require('crypto')
const router = express.Router()

const MIN_LENGTH = 8
const MAX_FAILS = 5
const LOCK_MS = 15 * 60 * 1000

function hashPwd(password, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(String(password), salt, 32).toString('hex')}`
}

function verifyPwd(password, stored) {
  // Hashes written before the scrypt switch are bare sha256 hex
  const actual = stored.includes(':')
    ? hashPwd(password, stored.split(':')[0])
    : crypto.createHash('sha256').update(String(password)).digest('hex')
  return actual.length === stored.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(stored))
}

// ip -> { count, until }. ponytail: in-memory, resets on restart; fine for one instance.
const fails = new Map()

function isLockedOut(ip) {
  const f = fails.get(ip)
  if (f && f.until && f.until < Date.now()) fails.delete(ip)
  return !!fails.get(ip)?.until
}

function recordFail(ip) {
  const f = fails.get(ip) || { count: 0, until: 0 }
  f.count++
  if (f.count >= MAX_FAILS) f.until = Date.now() + LOCK_MS
  fails.set(ip, f)
}

module.exports = function (configStore) {
  // Checks a password attempt, counting failures per IP
  function attempt(req, res, password) {
    if (isLockedOut(req.ip)) {
      res.status(429).json({ success: false, error: 'Too many wrong attempts. Try again in 15 minutes.' })
      return false
    }
    if (!verifyPwd(password, configStore.get('appPasswordHash'))) {
      recordFail(req.ip)
      return null
    }
    fails.delete(req.ip)
    return true
  }

  router.get('/status', (req, res) => {
    const hasPassword = !!configStore.get('appPasswordHash')
    res.json({ hasPassword, unlocked: req.session.unlocked || !hasPassword })
  })

  router.post('/unlock', (req, res) => {
    if (!configStore.get('appPasswordHash')) {
      req.session.unlocked = true
      return res.json({ success: true })
    }
    const ok = attempt(req, res, req.body.password)
    if (ok === false) return
    if (ok) req.session.unlocked = true
    res.json({ success: !!ok })
  })

  router.post('/set-password', (req, res) => {
    const { currentPassword, newPassword } = req.body
    if (configStore.get('appPasswordHash')) {
      const ok = attempt(req, res, currentPassword)
      if (ok === false) return
      if (!ok) return res.json({ success: false, error: 'Current password is incorrect.' })
    }
    if (!newPassword || newPassword.length < MIN_LENGTH) {
      return res.json({ success: false, error: `Password must be at least ${MIN_LENGTH} characters.` })
    }
    configStore.set('appPasswordHash', hashPwd(newPassword))
    req.session.unlocked = true
    res.json({ success: true })
  })

  router.post('/remove-password', (req, res) => {
    if (!configStore.get('appPasswordHash')) return res.json({ success: true })
    if (process.env.NODE_ENV === 'production') {
      return res.json({ success: false, error: 'A hosted app must keep its password.' })
    }
    const ok = attempt(req, res, req.body.currentPassword)
    if (ok === false) return
    if (!ok) return res.json({ success: false, error: 'Incorrect password.' })
    configStore.delete('appPasswordHash')
    req.session.unlocked = false
    res.json({ success: true })
  })

  return router
}

module.exports.hashPwd = hashPwd
module.exports.verifyPwd = verifyPwd
