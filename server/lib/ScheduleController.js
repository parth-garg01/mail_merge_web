const DAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

class ScheduleController {
  shouldSendNow(config) {
    const now = new Date()
    const day = DAY_ORDER[now.getDay()]
    const time = this._formatTime(now)

    if (!config.allowedDays.includes(day)) return false
    if (time < config.windowStart || time >= config.windowEnd) return false
    return true
  }

  msUntilNextValidWindow(config) {
    const now = new Date()
    const day = DAY_ORDER[now.getDay()]
    const time = this._formatTime(now)

    if (config.allowedDays.includes(day) && time < config.windowStart) {
      return this._msUntilTime(now, config.windowStart)
    }

    for (let i = 1; i <= 7; i++) {
      const nextDayIdx = (now.getDay() + i) % 7
      const nextDayName = DAY_ORDER[nextDayIdx]
      if (config.allowedDays.includes(nextDayName)) {
        const [h, m] = config.windowStart.split(':').map(Number)
        const next = new Date(now)
        next.setDate(next.getDate() + i)
        next.setHours(h, m, 0, 0)
        return next - now
      }
    }

    return 24 * 60 * 60 * 1000
  }

  calcSendTimes(count, schedule) {
    if (count === 0) return []
    const { startAt, windowStart, windowEnd, allowedDays, intervalMinutes } = schedule
    const MIN_LEAD_MS = 6 * 60 * 1000

    const minStart = new Date(Date.now() + MIN_LEAD_MS)
    let cursor = startAt ? new Date(Math.max(new Date(startAt).getTime(), minStart.getTime())) : minStart
    cursor = this._snapToValidWindow(cursor, allowedDays, windowStart, windowEnd)

    const intervalMs = Math.max(1, Number(intervalMinutes)) * 60 * 1000
    const times = []

    for (let i = 0; i < count; i++) {
      times.push(new Date(cursor))
      cursor = this._snapToValidWindow(
        new Date(cursor.getTime() + intervalMs),
        allowedDays, windowStart, windowEnd
      )
    }

    return times
  }

  _snapToValidWindow(date, allowedDays, windowStart, windowEnd) {
    const [wsH, wsM] = windowStart.split(':').map(Number)
    let d = new Date(date)

    for (let attempt = 0; attempt < 14; attempt++) {
      const dayName = DAY_ORDER[d.getDay()]
      const timeStr = this._formatTime(d)

      if (allowedDays.includes(dayName)) {
        if (timeStr >= windowStart && timeStr < windowEnd) return d
        if (timeStr < windowStart) {
          d.setHours(wsH, wsM, 0, 0)
          return d
        }
      }

      d.setDate(d.getDate() + 1)
      d.setHours(wsH, wsM, 0, 0)
    }

    return d
  }

  addJitter(baseMs, jitterSeconds = 30) {
    const jitter = (Math.random() * 2 - 1) * jitterSeconds * 1000
    return Math.max(60000, baseMs + jitter)
  }

  isCampaignStartTimeReached(startAt) {
    if (!startAt) return true
    return new Date() >= new Date(startAt)
  }

  msUntilStartTime(startAt) {
    if (!startAt) return 0
    return Math.max(0, new Date(startAt) - new Date())
  }

  _formatTime(date) {
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }

  _msUntilTime(from, timeStr) {
    const [h, m] = timeStr.split(':').map(Number)
    const target = new Date(from)
    target.setHours(h, m, 0, 0)
    return target - from
  }
}

module.exports = new ScheduleController()
