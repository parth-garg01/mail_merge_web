const { google } = require('googleapis')
const fs = require('fs')
const Store = require('../store')
const path = require('path')
const { REDIRECT_URI, DATA_DIR } = require('../config')

const tokenStore = new Store('auth-tokens')

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function plainTextToHtml(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map(paragraph => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

class GmailClient {
  constructor() {
    this.oauth2Client = null
  }

  init(clientId, clientSecret, redirectUri = REDIRECT_URI) {
    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)

    const stored = tokenStore.get('tokens')
    if (stored) this.oauth2Client.setCredentials(stored)

    this.oauth2Client.on('tokens', tokens => {
      const current = tokenStore.get('tokens') || {}
      tokenStore.set('tokens', { ...current, ...tokens })
    })
  }

  // Returns the Google OAuth URL — the browser navigates to it directly
  getAuthUrl() {
    if (!this.oauth2Client) throw new Error('GmailClient not initialized. Add credentials in Settings first.')
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.modify',
        'https://www.googleapis.com/auth/spreadsheets.readonly',
        'https://www.googleapis.com/auth/userinfo.email'
      ],
      prompt: 'consent'
    })
  }

  // Called by the /oauth2callback Express route after Google redirects back
  async handleCallback(code) {
    if (!this.oauth2Client) throw new Error('GmailClient not initialized.')
    const { tokens } = await this.oauth2Client.getToken(code)
    this.oauth2Client.setCredentials(tokens)
    tokenStore.set('tokens', tokens)

    const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client })
    const { data } = await oauth2.userinfo.get()
    tokenStore.set('userEmail', data.email)
    return { success: true, email: data.email }
  }

  isAuthenticated() {
    const tokens = tokenStore.get('tokens')
    return !!(tokens && (tokens.access_token || tokens.refresh_token))
  }

  getConnectedEmail() {
    return tokenStore.get('userEmail') || null
  }

  async revokeToken() {
    if (this.oauth2Client) {
      try { await this.oauth2Client.revokeCredentials() } catch {}
    }
    tokenStore.clear()
  }

  _buildRawMessage(from, to, subject, body, attachments = []) {
    const htmlBody = plainTextToHtml(body)
    const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`

    if (attachments.length === 0) {
      const msg = [
        `From: ${from}`,
        `To: ${to}`,
        `Subject: ${subjectEncoded}`,
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(htmlBody).toString('base64')
      ].join('\r\n')
      return Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    }

    const boundary = `mmw_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const lines = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subjectEncoded}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(htmlBody).toString('base64')
    ]

    for (const att of attachments) {
      // Only the file name is trusted: campaigns come from request bodies, and the
      // data dir can move between hosts.
      const content = fs.readFileSync(path.join(DATA_DIR, 'attachments', path.basename(att.path)))
      const safeName = att.name.replace(/"/g, '')
      lines.push(
        '',
        `--${boundary}`,
        `Content-Type: ${att.mimetype || 'application/octet-stream'}; name="${safeName}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${safeName}"`,
        '',
        content.toString('base64')
      )
    }

    lines.push('', `--${boundary}--`)
    const msg = lines.join('\r\n')
    return Buffer.from(msg).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  // Reads one tab of a Google Sheet as rows of cell values, using the connected account
  async readSheet({ spreadsheetId, gid }) {
    if (!this.isAuthenticated() || !this.oauth2Client) throw new Error('Connect your Google account in Settings first.')
    const sheets = google.sheets({ version: 'v4', auth: this.oauth2Client })
    try {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' })
      const tabs = meta.data.sheets.map(s => s.properties)
      const tab = gid === null ? tabs[0] : tabs.find(t => t.sheetId === gid)
      if (!tab) throw new Error('That tab no longer exists in the sheet.')
      const { data } = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab.title.replace(/'/g, "''")}'` })
      return { values: data.values || [], sheetName: tab.title }
    } catch (err) {
      const status = err?.response?.status
      if (status === 403 && /scope/i.test(err.message)) {
        throw new Error('Google Sheets access was not granted. Disconnect and reconnect your Google account in Settings.')
      }
      if (status === 403) throw new Error('The connected Google account cannot open this sheet.')
      if (status === 404) throw new Error('Sheet not found. Check the link.')
      throw err
    }
  }

  async send(to, subject, body, attachments = []) {
    if (!this.isAuthenticated()) throw new Error('Not authenticated. Please connect Gmail first.')
    if (!this.oauth2Client) throw new Error('GmailClient not initialized.')

    await this.oauth2Client.getAccessToken()

    const from = this.getConnectedEmail() || 'me'
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
    const raw = this._buildRawMessage(from, to, subject, body, attachments)

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    })

    return response.data
  }
}

module.exports = new GmailClient()
