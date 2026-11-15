// Helper murni untuk binding teks, dipakai bersama editor (index.html), overlay,
// dan control panel. Yang bergantung pada state halaman (resolveElementText dkk.)
// tetap tinggal di masing-masing halaman.
;(function (global) {
  function getSceneCanvasSize(scene) {
    return {
      width: Number(scene?.canvas?.width) || 1920,
      height: Number(scene?.canvas?.height) || 1080,
    }
  }

  function getValueAtPath(data, path) {
    if (!path) return data
    return (String(path).match(/[^.[\]]+/g) || []).reduce((current, segment) => {
      if (current === null || current === undefined) return undefined
      if (Array.isArray(current)) return current[Number(segment)]
      if (typeof current === 'object') return current[segment]
      return undefined
    }, data)
  }

  function formatBoundValue(value, format) {
    if (value === undefined || value === null || value === '') return ''
    if (format === 'number') {
      const numeric = Number(value)
      return Number.isFinite(numeric) ? new Intl.NumberFormat().format(numeric) : String(value)
    }
    if (format === 'uppercase') return String(value).toUpperCase()
    if (format === 'lowercase') return String(value).toLowerCase()
    return String(value)
  }

  function getFontStack(family) {
    const base = family || 'Inter, sans-serif'
    if (base.includes('Noto Color Emoji') || base.includes('Segoe UI Emoji')) return base
    return `${base}, 'Noto Color Emoji', 'Segoe UI Emoji', 'Apple Color Emoji', sans-serif`
  }

  function formatClockTime(timezone, formatStr, prefix = '', suffix = '') {
    const tz = timezone || 'Asia/Jakarta'
    const fmt = formatStr || 'HH:mm:ss'
    const now = new Date()

    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'long',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
      const parts = formatter.formatToParts(now)
      const p = {}
      for (const part of parts) {
        p[part.type] = part.value
      }

      let hour24 = parseInt(p.hour || '0', 10)
      if (hour24 === 24) hour24 = 0
      const hour12 = hour24 % 12 || 12
      const ampm = hour24 >= 12 ? 'PM' : 'AM'

      const monthNameFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'long' })
      const monthShortFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'short' })
      const weekdayShortFormatter = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' })

      const monthName = monthNameFormatter.format(now)
      const monthShort = monthShortFormatter.format(now)
      const weekdayShort = weekdayShortFormatter.format(now)

      const strHH = String(hour24).padStart(2, '0')
      const strH = String(hour24)
      const strhh = String(hour12).padStart(2, '0')
      const strh = String(hour12)
      const strmm = String(p.minute || '00').padStart(2, '0')
      const strm = String(parseInt(p.minute || '0', 10))
      const strss = String(p.second || '00').padStart(2, '0')
      const strs = String(parseInt(p.second || '0', 10))
      const strYYYY = p.year || '2026'
      const strYY = strYYYY.slice(-2)
      const strMM = p.month || '01'
      const strM = String(parseInt(strMM, 10))
      const strDD = p.day || '01'
      const strD = String(parseInt(strDD, 10))
      const strdddd = p.weekday || ''
      const strddd = weekdayShort

      const replacements = {
        dddd: strdddd,
        ddd: strddd,
        YYYY: strYYYY,
        yyyy: strYYYY,
        YY: strYY,
        yy: strYY,
        MMMM: monthName,
        MMM: monthShort,
        MM: strMM,
        M: strM,
        DD: strDD,
        dd: strDD,
        D: strD,
        d: strD,
        HH: strHH,
        H: strH,
        hh: strhh,
        h: strh,
        mm: strmm,
        m: strm,
        ss: strss,
        s: strs,
        A: ampm,
        a: ampm.toLowerCase(),
      }

      const regex = /dddd|ddd|YYYY|yyyy|YY|yy|MMMM|MMM|MM|M|DD|dd|D|d|HH|H|hh|h|mm|m|ss|s|A|a/g
      const result = fmt.replace(regex, (match) => replacements[match] !== undefined ? replacements[match] : match)

      return `${prefix}${result}${suffix}`
    } catch (e) {
      return `${prefix}${now.toLocaleTimeString()}${suffix}`
    }
  }

  function computeTimerDisplayMs(timer, now = Date.now()) {
    if (!timer) return 0
    const elapsed = (timer.isRunning && typeof timer.startedAtMs === 'number')
      ? now - timer.startedAtMs + (timer.pausedAccumMs || 0)
      : (timer.pausedAccumMs || 0)
    if (timer.mode === 'countdown') {
      const remaining = (timer.durationMs || 0) - elapsed
      return remaining <= 0 && !timer.continueBelowZero ? 0 : remaining
    }
    return elapsed
  }

  function formatTimerMs(ms, format) {
    const sign = ms < 0 ? '-' : ''
    const abs = Math.abs(Math.round(ms / 1000))
    const hh = Math.floor(abs / 3600)
    const mm = Math.floor((abs % 3600) / 60)
    const ss = abs % 60
    const pad = (n) => String(n).padStart(2, '0')

    if (format === 'hh:mm:ss') {
      return `${sign}${pad(hh)}:${pad(mm)}:${pad(ss)}`
    }
    if (format === 'seconds') {
      return `${sign}${abs}`
    }
    // default 'mm:ss' — kalau lebih dari 1 jam, ikut meluap ke menit (tidak dipotong)
    const totalMinutes = Math.floor(abs / 60)
    return `${sign}${pad(totalMinutes)}:${pad(ss)}`
  }

  // Fase 9 — Element Binding/Grouping (Vision.md §3.3.2). Scope sengaja 1 level:
  // parent yang sudah jadi child elemen lain diabaikan (fallback ke top-level).
  function getEffectiveParentId(el, byId) {
    if (!el || !el.parentId) return null
    const parent = byId.get(el.parentId)
    if (!parent || parent.id === el.id) return null
    if (parent.parentId && byId.has(parent.parentId)) return null
    return parent.id
  }

  global.TextBinding = {
    getSceneCanvasSize,
    getValueAtPath,
    formatBoundValue,
    getFontStack,
    formatClockTime,
    computeTimerDisplayMs,
    formatTimerMs,
    getEffectiveParentId,
  }
})(window)
