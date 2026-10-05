require('dotenv').config()
const express = require('express')
const session = require('express-session')
const { WebSocketServer } = require('ws')
const http = require('http')
const path = require('path')

const { PORT, PUBLIC_URL } = require('./config')
const Store = require('./store')
const gmailClient = require('./lib/GmailClient')
const logger = require('./lib/Logger')
const runner = require('./runner')

const configStore = new Store('app-config')

const app = express()
const server = http.createServer(app)

// ─── WebSocket ────────────────────────────────────────────────────────────────

const wss = new WebSocketServer({ server, path: '/ws' })

function broadcast(event, data) {
  const msg = JSON.stringify({ event, data })
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg)
  })
}

runner.setBroadcast(broadcast)

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}))

// Auth guard — all /api routes except /api/auth require unlock when password is set
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth')) return next()
  const hasPassword = !!configStore.get('appPasswordHash')
  if (!hasPassword || req.session.unlocked) return next()
  res.status(401).json({ error: 'Unauthorized' })
})

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth', require('./routes/auth')(configStore))
app.use('/api/attachments', require('./routes/attachment'))
app.use('/api/sheet', require('./routes/sheet'))
app.use('/api/template', require('./routes/template'))
app.use('/api/gmail', require('./routes/gmail')(configStore))
app.use('/api/campaigns', require('./routes/campaign')(configStore))
app.use('/api/campaigns/:id/queue', require('./routes/queue')(configStore))
app.use('/api/campaigns/:id/logs', require('./routes/log'))
app.use('/api/settings', require('./routes/settings')(configStore))

// ─── Gmail OAuth callback ─────────────────────────────────────────────────────

app.get('/oauth2callback', async (req, res) => {
  const { code, error } = req.query
  if (error) {
    return res.redirect('/?auth=error&msg=' + encodeURIComponent(error))
  }
  if (!code) {
    return res.redirect('/?auth=error&msg=no_code')
  }
  try {
    await gmailClient.handleCallback(code)
    res.redirect('/?auth=success')
  } catch (err) {
    res.redirect('/?auth=error&msg=' + encodeURIComponent(err.message))
  }
})

// ─── Static files (production) ────────────────────────────────────────────────

const PUBLIC_DIR = path.join(__dirname, 'public')
app.use(express.static(PUBLIC_DIR))
app.get('*', (req, res) => {
  const indexHtml = path.join(PUBLIC_DIR, 'index.html')
  const fs = require('fs')
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml)
  } else {
    res.status(404).send('Run "npm run build" first, or start the Vite dev server.')
  }
})

// ─── Startup ──────────────────────────────────────────────────────────────────

const clientId = configStore.get('googleClientId', process.env.GOOGLE_CLIENT_ID || '')
const clientSecret = configStore.get('googleClientSecret', process.env.GOOGLE_CLIENT_SECRET || '')
if (clientId && clientSecret) {
  gmailClient.init(clientId, clientSecret)
}

// Resume any campaigns that were running before a server restart
const campaigns = configStore.get('campaigns', {})
for (const [id, c] of Object.entries(campaigns)) {
  if (c.status === 'running') {
    function makeSave(store) {
      return function (campaign) {
        const all = store.get('campaigns', {})
        all[campaign.id] = { ...campaign, updatedAt: new Date().toISOString() }
        store.set('campaigns', all)
      }
    }
    runner.runCampaign(id, c, makeSave(configStore))
  }
}

server.listen(PORT, () => {
  console.log(`Smart Mail Merger running at ${PUBLIC_URL}`)
})
