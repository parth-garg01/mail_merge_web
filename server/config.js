const path = require('path')
const os = require('os')
const fs = require('fs')

const PORT = process.env.PORT || 5000

// On a cloud host, point DATA_DIR at a persistent disk so campaigns, queues and
// the Gmail token survive restarts and redeploys.
const DATA_DIR = process.env.DATA_DIR || path.join(os.homedir(), '.smart-mail-merger-web')
fs.mkdirSync(DATA_DIR, { recursive: true })

// PUBLIC_URL is the address the app is reached at; Render sets RENDER_EXTERNAL_URL itself.
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/+$/, '')
const REDIRECT_URI = process.env.REDIRECT_URI || `${PUBLIC_URL}/oauth2callback`

const IS_PROD = process.env.NODE_ENV === 'production'

module.exports = { PORT, DATA_DIR, PUBLIC_URL, REDIRECT_URI, IS_PROD }
