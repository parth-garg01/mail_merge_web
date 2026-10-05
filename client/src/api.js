const BASE = '/api'

async function call(method, path, body) {
  const opts = { method, headers: {} }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok && res.status === 401) {
    return { error: 'Unauthorized' }
  }
  return res.json()
}

const api = {
  auth: {
    status: () => call('GET', '/auth/status'),
    unlock: (password) => call('POST', '/auth/unlock', { password }),
    setPassword: (params) => call('POST', '/auth/set-password', params),
    removePassword: (params) => call('POST', '/auth/remove-password', params)
  },

  sheet: {
    // Browser file upload — accepts a File object from <input type="file">
    parse: (file) => {
      const form = new FormData()
      form.append('file', file)
      return fetch(`${BASE}/sheet/upload`, { method: 'POST', body: form }).then(r => r.json())
    },
    fromGoogle: (url) => call('POST', '/sheet/google', { url }),
    validate: (params) => call('POST', '/sheet/validate', params)
  },

  attachment: {
    upload: (file) => {
      const form = new FormData()
      form.append('file', file)
      return fetch(`${BASE}/attachments/upload`, { method: 'POST', body: form }).then(r => r.json())
    },
    remove: (id) => call('DELETE', `/attachments/${id}`)
  },

  template: {
    validate: (params) => call('POST', '/template/validate', params),
    preview: (params) => call('POST', '/template/preview', params)
  },

  gmail: {
    status: () => call('GET', '/gmail/status'),
    // Returns { url } — caller redirects the browser to that URL
    getAuthUrl: () => call('GET', '/gmail/auth-url'),
    revoke: () => call('POST', '/gmail/revoke'),
    setCredentials: (creds) => call('POST', '/gmail/credentials', creds)
  },

  campaign: {
    create: (config) => call('POST', '/campaigns', config),
    list: () => call('GET', '/campaigns'),
    get: (id) => call('GET', `/campaigns/${id}`),
    delete: (id) => call('DELETE', `/campaigns/${id}`),
    initQueue: ({ campaignId, recipients, emailColumn }) =>
      call('POST', `/campaigns/${campaignId}/queue/init`, { recipients, emailColumn }),
    start: (id) => call('POST', `/campaigns/${id}/start`),
    pause: (id) => call('POST', `/campaigns/${id}/pause`),
    resume: (id) => call('POST', `/campaigns/${id}/resume`),
    stop: (id) => call('POST', `/campaigns/${id}/stop`),
    updateSchedule: ({ campaignId, schedule }) =>
      call('PUT', `/campaigns/${campaignId}/schedule`, { schedule })
  },

  queue: {
    get: (campaignId) => call('GET', `/campaigns/${campaignId}/queue`),
    stats: (campaignId) => call('GET', `/campaigns/${campaignId}/queue/stats`),
    skip: ({ campaignId, recipientId }) =>
      call('POST', `/campaigns/${campaignId}/queue/${recipientId}/skip`),
    retry: ({ campaignId, recipientId }) =>
      call('POST', `/campaigns/${campaignId}/queue/${recipientId}/retry`)
  },

  log: {
    get: (campaignId) => call('GET', `/campaigns/${campaignId}/logs`),
    export: (campaignId) => {
      window.open(`${BASE}/campaigns/${campaignId}/logs/export`)
      return Promise.resolve({ success: true })
    }
  },

  settings: {
    get: () => call('GET', '/settings'),
    save: (settings) => call('POST', '/settings', settings)
  }
}

export default api
