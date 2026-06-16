import React, { useState, useEffect, createContext, useContext } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import ImportSheet from './pages/ImportSheet'
import TemplateEditor from './pages/TemplateEditor'
import ScheduleConfig from './pages/ScheduleConfig'
import CampaignMonitor from './pages/CampaignMonitor'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import LockScreen from './pages/LockScreen'
import api from './api'

export const AppContext = createContext(null)
export const useApp = () => useContext(AppContext)

const DEFAULT_WIZARD = {
  sheetData: null,
  sheetFile: null,
  emailColumn: '',
  subjectTemplate: '',
  bodyTemplate: '',
  attachments: [],
  campaignName: '',
  schedule: {
    startAt: '',
    windowStart: '08:00',
    windowEnd: '15:00',
    allowedDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    intervalMinutes: 5
  }
}

export default function App() {
  const [page, setPage] = useState('dashboard')
  const [activeCampaignId, setActiveCampaignId] = useState(null)
  const [gmailStatus, setGmailStatus] = useState({ authenticated: false, email: null })
  const [wizard, setWizard] = useState(DEFAULT_WIZARD)
  // null = auth check pending; true = locked; false = unlocked
  const [isLocked, setIsLocked] = useState(null)
  const [authToast, setAuthToast] = useState('')

  useEffect(() => {
    api.gmail.status().then(setGmailStatus).catch(() => {})
    api.auth.status()
      .then(({ hasPassword, unlocked }) => setIsLocked(hasPassword && !unlocked))
      .catch(() => setIsLocked(false))  // server unreachable → show app unlocked

    // Show toast if redirected back from Google OAuth
    const params = new URLSearchParams(location.search)
    if (params.get('auth') === 'success') {
      setAuthToast('Gmail connected successfully!')
      api.gmail.status().then(setGmailStatus)
      window.history.replaceState({}, '', '/')
      setTimeout(() => setAuthToast(''), 4000)
    } else if (params.get('auth') === 'error') {
      setAuthToast('Gmail connection failed: ' + (params.get('msg') || 'unknown error'))
      window.history.replaceState({}, '', '/')
      setTimeout(() => setAuthToast(''), 6000)
    }
  }, [])

  function resetWizard() { setWizard(DEFAULT_WIZARD) }
  function updateWizard(patch) { setWizard(prev => ({ ...prev, ...patch })) }

  function navigate(target, campaignId = null) {
    setPage(target)
    if (campaignId) setActiveCampaignId(campaignId)
  }

  const ctx = {
    page, navigate,
    activeCampaignId, setActiveCampaignId,
    gmailStatus, setGmailStatus,
    wizard, updateWizard, resetWizard
  }

  const PAGES = {
    dashboard: Dashboard,
    import: ImportSheet,
    template: TemplateEditor,
    schedule: ScheduleConfig,
    monitor: CampaignMonitor,
    logs: Logs,
    settings: Settings
  }

  const Page = PAGES[page] || Dashboard

  if (isLocked === null) return <div className="h-screen bg-slate-900" />
  if (isLocked) return <LockScreen onUnlock={() => setIsLocked(false)} />

  return (
    <AppContext.Provider value={ctx}>
      <div className="flex h-screen bg-slate-900 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto min-w-0 relative">
          <Page />
          {authToast && (
            <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl text-sm font-medium shadow-lg z-50 ${
              authToast.includes('failed') ? 'bg-red-900 text-red-200 border border-red-700' : 'bg-green-900 text-green-200 border border-green-700'
            }`}>
              {authToast}
            </div>
          )}
        </main>
      </div>
    </AppContext.Provider>
  )
}
