const { google } = require('googleapis')
const Store = require('../store')

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

  init(clientId, clientSecret, redirectUri = 'http://localhost:5000/oauth2callback') {
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

  _buildRawMessage(from, to, subject, body) {
    const htmlBody = plainTextToHtml(body)
    const msg = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      Buffer.from(htmlBody).toString('base64')
    ].join('\r\n')

    return Buffer.from(msg)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
  }

  async send(to, subject, body) {
    if (!this.isAuthenticated()) throw new Error('Not authenticated. Please connect Gmail first.')
    if (!this.oauth2Client) throw new Error('GmailClient not initialized.')

    await this.oauth2Client.getAccessToken()

    const from = this.getConnectedEmail() || 'me'
    const gmail = google.gmail({ version: 'v1', auth: this.oauth2Client })
    const raw = this._buildRawMessage(from, to, subject, body)

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw }
    })

    return response.data
  }
}

module.exports = new GmailClient()
