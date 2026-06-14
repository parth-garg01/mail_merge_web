import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useApp } from '../App'
import StatusBadge from '../components/StatusBadge'
import ProgressBar from '../components/ProgressBar'
import api from '../api'
import { wsOn, wsOff } from '../ws'

function formatMs(ms) {
  if (ms <= 0) return '0s'
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtScheduled(ts) {
  if (!ts) return '—'
  if (ts === 'now') return 'Sending now'
  const d = new Date(ts)
  const today = new Date()
  const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return timeStr
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} · ${timeStr}`
}

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DEFAULT_SCHED = { startAt: '', windowStart: '08:00', windowEnd: '15:00', allowedDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], intervalMinutes: 5 }

export default function CampaignMonitor() {
  const { activeCampaignId, navigate } = useApp()
  const [campaign, setCampaign] = useState(null)
  const [queue, setQueue] = useState([])
  const [stats, setStats] = useState({ total: 0, sent: 0, pending: 0, sending: 0, failed: 0, skipped: 0 })
  const [actionMsg, setActionMsg] = useState('')
  const [nextSendAt, setNextSendAt] = useState(null)
  const [countdown, setCountdown] = useState(0)
  const [waitMsg, setWaitMsg] = useState('')
  const [filter, setFilter] = useState('all')
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [schedForm, setSchedForm] = useState(DEFAULT_SCHED)
  const [schedSaving, setSchedSaving] = useState(false)
  const [schedError, setSchedError] = useState('')

  const load = useCallback(async () => {
    if (!activeCampaignId) return
    const [c, q, s] = await Promise.all([
      api.campaign.get(activeCampaignId),
      api.queue.get(activeCampaignId),
      api.queue.stats(activeCampaignId)
    ])
    if (c) {
      setCampaign(c)
      setSchedForm(prev => editingSchedule ? prev : { ...DEFAULT_SCHED, ...c.schedule })
    }
    if (q) setQueue(q)
    if (s) setStats(s)
  }, [activeCampaignId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load()

    const onSent = () => load()
    const onFailed = () => load()
    const onComplete = () => load()
    const onNextSend = ({ nextSendAt: t }) => setNextSendAt(t)
    const onWaiting = ({ msToWait, reason }) => {
      setWaitMsg(reason)
      setNextSendAt(Date.now() + msToWait)
    }

    wsOn('campaign:sent', onSent)
    wsOn('campaign:failed', onFailed)
    wsOn('campaign:complete', onComplete)
    wsOn('campaign:nextSend', onNextSend)
    wsOn('campaign:waiting', onWaiting)

    return () => {
      wsOff('campaign:sent', onSent)
      wsOff('campaign:failed', onFailed)
      wsOff('campaign:complete', onComplete)
      wsOff('campaign:nextSend', onNextSend)
      wsOff('campaign:waiting', onWaiting)
    }
  }, [load])

  useEffect(() => {
    const timer = setInterval(() => {
      if (nextSendAt) setCountdown(Math.max(0, nextSendAt - Date.now()))
    }, 500)
    return () => clearInterval(timer)
  }, [nextSendAt])

  async function handlePause() {
    await api.campaign.pause(activeCampaignId)
    load()
  }

  async function handleResume() {
    await api.campaign.resume(activeCampaignId)
    load()
    setWaitMsg('')
  }

  async function handleStop() {
    if (!confirm('Stop this campaign? This cannot be undone.')) return
    await api.campaign.stop(activeCampaignId)
    load()
  }

  async function handleSkip(recipientId) {
    setActionMsg('')
    await api.queue.skip({ campaignId: activeCampaignId, recipientId })
    load()
  }

  async function handleRetry(recipientId) {
    setActionMsg('')
    const result = await api.queue.retry({ campaignId: activeCampaignId, recipientId })
    if (!result?.success) {
      setActionMsg(result?.error || 'Could not retry this recipient.')
      return
    }
    setWaitMsg('')
    load()
  }

  async function handleSaveSchedule() {
    if (schedForm.allowedDays.length === 0) {
      setSchedError('Select at least one allowed day.')
      return
    }
    setSchedSaving(true)
    setSchedError('')
    const result = await api.campaign.updateSchedule({ campaignId: activeCampaignId, schedule: schedForm })
    setSchedSaving(false)
    if (!result?.success) {
      setSchedError(result?.error || 'Could not save schedule.')
      return
    }
    setEditingSchedule(false)
    load()
  }

  const scheduledForMap = useMemo(() => {
    const intervalMs = (campaign?.schedule?.intervalMinutes || 5) * 60 * 1000
    const base = nextSendAt || Date.now()
    const map = {}
    let pendingOffset = 0
    for (const r of queue) {
      if (r.scheduledTime) {
        map[r.id] = new Date(r.scheduledTime).getTime()
      } else if (r.status === 'sending') {
        map[r.id] = 'now'
      } else if (r.status === 'pending') {
        map[r.id] = base + pendingOffset * intervalMs
        pendingOffset++
      } else {
        map[r.id] = null
      }
    }
    return map
  }, [queue, nextSendAt, campaign?.schedule?.intervalMinutes])

  const filtered = filter === 'all' ? queue : queue.filter(r => r.status === filter)
  const isRunning = campaign?.status === 'running'
  const isPaused = campaign?.status === 'paused'

  if (!activeCampaignId) {
    return (
      <div className="p-8 text-center py-24 text-slate-500">
        No active campaign selected.{' '}
        <button onClick={() => navigate('dashboard')} className="text-indigo-400 hover:underline">Go to Dashboard</button>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">{campaign?.name || 'Campaign Monitor'}</h1>
          <div className="flex items-center gap-3 mt-2">
            {campaign && <StatusBadge status={campaign.status} pulse />}
            {isRunning && countdown > 0 && (
              <span className="text-xs text-slate-400">
                Next send in <strong className="text-slate-200">{formatMs(countdown)}</strong>
              </span>
            )}
            {waitMsg && <span className="text-xs text-amber-400">{waitMsg}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isRunning && <button onClick={handlePause} className="btn-secondary">⏸ Pause</button>}
          {isPaused && <button onClick={handleResume} className="btn-primary">▶ Resume</button>}
          {(isRunning || isPaused) && <button onClick={handleStop} className="btn-danger">■ Stop</button>}
          {campaign?.status !== 'completed' && (
            <button
              onClick={() => { setEditingSchedule(v => !v); setSchedError('') }}
              className="btn-secondary"
            >
              {editingSchedule ? 'Cancel' : 'Edit Schedule'}
            </button>
          )}
          <button onClick={() => navigate('logs')} className="btn-secondary">View Logs</button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Sent', value: stats.sent, color: 'text-green-400' },
          { label: 'Pending', value: stats.pending + (stats.sending || 0), color: 'text-indigo-400' },
          { label: 'Failed', value: stats.failed, color: 'text-red-400' },
          { label: 'Skipped', value: stats.skipped, color: 'text-yellow-400' }
        ].map(s => (
          <div key={s.label} className="card py-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-slate-500 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="card mb-6">
        <ProgressBar sent={stats.sent} total={stats.total} />
        {stats.pending > 0 && campaign?.schedule?.intervalMinutes && (
          <p className="text-slate-500 text-xs mt-2">
            Est. remaining: ~{Math.ceil(stats.pending * campaign.schedule.intervalMinutes)} min
          </p>
        )}
      </div>

      {editingSchedule && (
        <div className="card mb-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Edit Schedule</h3>

          <div>
            <label className="label">Scheduled Start Date & Time</label>
            <input
              type="datetime-local"
              value={schedForm.startAt}
              onChange={e => setSchedForm(f => ({ ...f, startAt: e.target.value }))}
              className="input-field"
            />
            <p className="text-slate-500 text-xs mt-1">Clear to start / resume immediately</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Window Start</label>
              <input type="time" value={schedForm.windowStart} onChange={e => setSchedForm(f => ({ ...f, windowStart: e.target.value }))} className="input-field" />
            </div>
            <div>
              <label className="label">Window End</label>
              <input type="time" value={schedForm.windowEnd} onChange={e => setSchedForm(f => ({ ...f, windowEnd: e.target.value }))} className="input-field" />
            </div>
          </div>

          <div>
            <label className="label">Allowed Days</label>
            <div className="flex gap-2 mt-1">
              {ALL_DAYS.map(day => {
                const active = schedForm.allowedDays.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setSchedForm(f => ({
                      ...f,
                      allowedDays: active ? f.allowedDays.filter(d => d !== day) : [...f.allowedDays, day]
                    }))}
                    className={`w-10 h-10 rounded-lg text-xs font-medium transition-colors ${active ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-400 hover:bg-slate-600'}`}
                  >
                    {day}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="label">Interval — {schedForm.intervalMinutes} min</label>
            <input
              type="range" min="1" max="60"
              value={schedForm.intervalMinutes}
              onChange={e => setSchedForm(f => ({ ...f, intervalMinutes: Number(e.target.value) }))}
              className="w-full accent-indigo-500"
            />
          </div>

          {schedError && <p className="text-red-400 text-xs">{schedError}</p>}

          <div className="flex gap-3 pt-1">
            <button onClick={handleSaveSchedule} disabled={schedSaving} className="btn-primary">
              {schedSaving ? 'Saving…' : 'Save Schedule'}
            </button>
            <button onClick={() => setEditingSchedule(false)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
          <div>
            <p className="text-sm font-medium text-slate-300">Recipient Queue</p>
            {actionMsg && <p className="text-xs text-red-400 mt-1">{actionMsg}</p>}
          </div>
          <div className="flex gap-1">
            {['all', 'pending', 'sending', 'sent', 'failed', 'skipped'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${filter === f ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto max-h-[400px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-800/90 backdrop-blur-sm">
              <tr className="border-b border-slate-700">
                <th className="text-left text-slate-400 font-medium px-5 py-2">Email</th>
                <th className="text-left text-slate-400 font-medium px-4 py-2">Status</th>
                <th className="text-left text-slate-400 font-medium px-4 py-2">Scheduled For</th>
                <th className="text-left text-slate-400 font-medium px-4 py-2">Sent At</th>
                <th className="text-left text-slate-400 font-medium px-4 py-2">Error</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-slate-700/40 last:border-0 hover:bg-slate-700/20">
                  <td className="px-5 py-2.5 text-slate-300 font-medium">{r.email}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-2.5 text-slate-400 whitespace-nowrap">
                    {scheduledForMap[r.id] === 'now'
                      ? <span className="text-indigo-400 font-medium">Sending now</span>
                      : scheduledForMap[r.id]
                        ? <span className={scheduledForMap[r.id] - Date.now() < 300000 ? 'text-amber-400' : 'text-slate-400'}>
                            {fmtScheduled(scheduledForMap[r.id])}
                          </span>
                        : <span className="text-slate-600">—</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {r.sentAt ? new Date(r.sentAt).toLocaleTimeString() : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-red-400 max-w-[200px] truncate">
                    {r.errorMessage || '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {r.status === 'pending' && (
                      <button onClick={() => handleSkip(r.id)} className="text-xs text-slate-500 hover:text-yellow-400 transition-colors">Skip</button>
                    )}
                    {r.status === 'failed' && (
                      <button onClick={() => handleRetry(r.id)} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Retry</button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-500">No recipients with status "{filter}"</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
