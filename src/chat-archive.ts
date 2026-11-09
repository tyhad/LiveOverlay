import { mkdir, readdir, stat } from 'node:fs/promises'
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ChatEvent, ChatPlatform } from './chat-types'

export interface SessionMeta {
  id: string
  startedAt: string
  endedAt?: string
  interrupted: boolean
  chatCount: number
  bytes: number
  isActive?: boolean
}

export interface ArchiveExportOptions {
  format?: 'srt' | 'vtt' | 'csv' | 'json'
  offset?: number
  mode?: 'stack' | 'single'
  lines?: number
  ttl?: number
  tags?: boolean | number
}

export interface ExportResult {
  content: string
  filename: string
  contentType: string
}

export function formatTimeSrt(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const ms = totalMs % 1000
  const totalSec = Math.floor(totalMs / 1000)
  const s = totalSec % 60
  const totalMin = Math.floor(totalSec / 60)
  const m = totalMin % 60
  const h = Math.floor(totalMin / 60)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

export function formatTimeVtt(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const ms = totalMs % 1000
  const totalSec = Math.floor(totalMs / 1000)
  const s = totalSec % 60
  const totalMin = Math.floor(totalSec / 60)
  const m = totalMin % 60
  const h = Math.floor(totalMin / 60)
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms, 3)}`
}

export function parseVideoTime(str: string): number {
  const clean = String(str || '').trim()
  if (!clean) return 0
  const parts = clean.split(':').map((p) => parseFloat(p))
  if (parts.some((p) => Number.isNaN(p))) return 0
  if (parts.length === 1) return parts[0]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return 0
}

function escapeCsvCell(val: unknown): string {
  let str = String(val ?? '')
  // Prevent CSV injection for spreadsheet programs
  if (/^[=+\-@]/.test(str)) {
    str = `'${str}`
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export class ChatArchiveManager {
  private baseDir: string
  private activeSessionId: string | null = null
  private activeStartedAt: string | null = null
  private activeChatCount = 0
  private writeBuffer: string[] = []
  private flushTimer: ReturnType<typeof setTimeout> | null = null
  private flushPromise: Promise<void> | null = null
  private now: () => number

  constructor(options: { baseDir?: string; now?: () => number } = {}) {
    this.baseDir = options.baseDir || process.env.CHAT_ARCHIVE_DIR || 'chat-archive'
    this.now = options.now || Date.now
  }

  getBaseDir(): string {
    return this.baseDir
  }

  getActiveSessionId(): string | null {
    return this.activeSessionId
  }

  private async ensureDir(): Promise<void> {
    try {
      await mkdir(this.baseDir, { recursive: true })
    } catch {
      // Best-effort
    }
  }

  private formatSessionId(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0')
    const y = date.getFullYear()
    const m = pad(date.getMonth() + 1)
    const d = pad(date.getDate())
    const h = pad(date.getHours())
    const min = pad(date.getMinutes())
    const s = pad(date.getSeconds())
    return `${y}${m}${d}-${h}${min}${s}`
  }

  async startSession(): Promise<string> {
    if (this.activeSessionId) return this.activeSessionId
    await this.ensureDir()

    const date = new Date(this.now())
    const sessionId = this.formatSessionId(date)
    const startedAt = date.toISOString()

    this.activeSessionId = sessionId
    this.activeStartedAt = startedAt
    this.activeChatCount = 0

    const sessionLine = JSON.stringify({ type: 'session', v: 1, startedAt }) + '\n'
    this.writeBuffer.push(sessionLine)
    await this.flush()
    return sessionId
  }

  appendChat(event: ChatEvent): void {
    if (!this.activeSessionId) {
      void this.startSession().then(() => this.appendChat(event))
      return
    }

    this.activeChatCount++
    const line = JSON.stringify({
      type: 'chat',
      seq: event.seq,
      id: event.id,
      platform: event.platform,
      author: event.author,
      message: event.message,
      ts: event.ts,
    }) + '\n'

    this.writeBuffer.push(line)
    if (this.writeBuffer.length >= 100) {
      void this.flush()
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        void this.flush()
      }, 1000)
    }
  }

  appendStatus(platform: ChatPlatform, event: string, detail?: string): void {
    if (!this.activeSessionId) return
    const line = JSON.stringify({
      type: 'status',
      platform,
      event,
      ts: this.now(),
      ...(detail ? { detail } : {}),
    }) + '\n'
    this.writeBuffer.push(line)
  }

  async flush(): Promise<void> {
    // Chain flushes to avoid concurrent writes clobbering each other
    if (this.flushPromise) {
      this.flushPromise = this.flushPromise.then(() => this._doFlush())
    } else {
      this.flushPromise = this._doFlush().finally(() => { this.flushPromise = null })
    }
    return this.flushPromise
  }

  private async _doFlush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    if (this.writeBuffer.length === 0 || !this.activeSessionId) return

    const chunk = this.writeBuffer.join('')
    this.writeBuffer = []
    const filePath = join(this.baseDir, `${this.activeSessionId}.jsonl`)
    try {
      await appendFile(filePath, chunk, 'utf-8')
    } catch (err) {
      console.error('[chat-archive] Flush error:', err)
    }
  }

  async endSession(): Promise<void> {
    if (!this.activeSessionId) return
    // Drain any in-flight flush first
    if (this.flushPromise) await this.flushPromise
    const endedAt = new Date(this.now()).toISOString()
    const endLine = JSON.stringify({ type: 'session_end', endedAt }) + '\n'
    this.writeBuffer.push(endLine)
    await this.flush()

    this.activeSessionId = null
    this.activeStartedAt = null
    this.activeChatCount = 0
  }

  async listSessions(): Promise<SessionMeta[]> {
    await this.ensureDir()
    let files: string[] = []
    try {
      files = await readdir(this.baseDir)
    } catch {
      return []
    }

    const jsonlFiles = files.filter((f) => f.endsWith('.jsonl'))
    const sessions: SessionMeta[] = []

    for (const f of jsonlFiles) {
      const sessionId = f.replace(/\.jsonl$/, '')
      const filePath = join(this.baseDir, f)
      try {
        const fileStat = await stat(filePath)
        const parsed = await this.readSessionLines(sessionId)
        const isActive = sessionId === this.activeSessionId
        sessions.push({
          id: sessionId,
          startedAt: parsed.startedAt || new Date(fileStat.birthtimeMs || fileStat.mtimeMs).toISOString(),
          endedAt: parsed.endedAt,
          interrupted: !parsed.endedAt && !isActive,
          chatCount: parsed.chats.length,
          bytes: fileStat.size,
          isActive,
        })
      } catch {
        // Skip corrupted unreadable file
      }
    }

    return sessions.sort((a, b) => b.id.localeCompare(a.id))
  }

  async readSessionLines(sessionId: string): Promise<{
    startedAt: string
    endedAt?: string
    chats: ChatEvent[]
    statuses: any[]
  }> {
    const filePath = join(this.baseDir, `${sessionId}.jsonl`)
    const file = Bun.file(filePath)
    if (!(await file.exists())) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const text = await file.text()
    const rawLines = text.split('\n')
    let startedAt = ''
    let endedAt: string | undefined
    const chats: ChatEvent[] = []
    const statuses: any[] = []

    for (const line of rawLines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const obj = JSON.parse(trimmed)
        if (obj.type === 'session' && obj.startedAt) {
          startedAt = obj.startedAt
        } else if (obj.type === 'session_end' && obj.endedAt) {
          endedAt = obj.endedAt
        } else if (obj.type === 'chat') {
          chats.push({
            seq: Number(obj.seq) || chats.length + 1,
            id: String(obj.id || ''),
            platform: obj.platform,
            author: String(obj.author || 'viewer'),
            message: String(obj.message || ''),
            ts: Number(obj.ts) || 0,
          })
        } else if (obj.type === 'status') {
          statuses.push(obj)
        }
      } catch {
        // Tolerant parser: ignore malformed or truncated last lines
      }
    }

    return { startedAt, endedAt, chats, statuses }
  }

  async getSessionChats(
    sessionId: string,
    offset = 0,
    limit = 50
  ): Promise<{ chats: ChatEvent[]; total: number }> {
    const { chats } = await this.readSessionLines(sessionId)
    const start = Math.max(0, offset)
    const end = start + Math.max(1, limit)
    return {
      chats: chats.slice(start, end),
      total: chats.length,
    }
  }

  async calculateAlignment(
    sessionId: string,
    chatSeq: number,
    videoTimeStr: string
  ): Promise<{ offsetSec: number }> {
    const { startedAt, chats } = await this.readSessionLines(sessionId)
    const startedAtMs = Date.parse(startedAt)
    if (!startedAtMs) {
      throw new Error(`Session ${sessionId} has invalid startedAt timestamp`)
    }

    const targetChat = chats.find((c) => c.seq === chatSeq)
    if (!targetChat) {
      throw new Error(`Chat with seq ${chatSeq} not found in session ${sessionId}`)
    }

    const videoTimeSec = parseVideoTime(videoTimeStr)
    const chatRelTimeSec = (targetChat.ts - startedAtMs) / 1000
    const offsetSec = Number((videoTimeSec - chatRelTimeSec).toFixed(3))
    return { offsetSec }
  }

  async exportSession(
    sessionId: string,
    options: ArchiveExportOptions = {}
  ): Promise<ExportResult> {
    const { startedAt, chats } = await this.readSessionLines(sessionId)
    const startedAtMs = Date.parse(startedAt) || 0

    const format = options.format || 'srt'
    const offset = Number(options.offset) || 0
    const mode = options.mode || 'stack'
    const lines = Math.max(1, Math.min(30, Number(options.lines) || 5))
    const ttl = Math.max(1, Number(options.ttl) || 8)
    const useTags = options.tags === undefined ? true : Boolean(Number(options.tags))

    const formatMessage = (c: ChatEvent, isVtt = false) => {
      let tag = ''
      if (useTags) {
        tag = c.platform === 'tiktok' ? '[TT] ' : c.platform === 'youtube' ? '[YT] ' : ''
      }
      let msg = c.message.replace(/[\r\n]+/g, ' ')
      if (isVtt) {
        msg = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      }
      return `${tag}${c.author}: ${msg}`
    }

    if (format === 'json') {
      return {
        content: JSON.stringify(
          {
            sessionId,
            startedAt,
            offset,
            mode,
            chats: chats.map((c) => ({
              ...c,
              t_rel_sec: Number(((c.ts - startedAtMs) / 1000 + offset).toFixed(3)),
            })),
          },
          null,
          2
        ),
        filename: `chat-${sessionId}.json`,
        contentType: 'application/json; charset=utf-8',
      }
    }

    if (format === 'csv') {
      const rows = ['ts_iso,t_rel_sec,platform,author,message']
      for (const c of chats) {
        const tRel = ((c.ts - startedAtMs) / 1000 + offset).toFixed(3)
        const tsIso = new Date(c.ts).toISOString()
        rows.push(
          [
            escapeCsvCell(tsIso),
            escapeCsvCell(tRel),
            escapeCsvCell(c.platform),
            escapeCsvCell(c.author),
            escapeCsvCell(c.message),
          ].join(',')
        )
      }
      return {
        content: rows.join('\r\n'),
        filename: `chat-${sessionId}.csv`,
        contentType: 'text/csv; charset=utf-8',
      }
    }

    // Build subtitle cues (SRT / VTT)
    const isVtt = format === 'vtt'
    interface SubCue {
      start: number
      end: number
      text: string
    }
    const rawCues: SubCue[] = []

    if (mode === 'single') {
      for (const c of chats) {
        const t = (c.ts - startedAtMs) / 1000 + offset
        const start = Math.max(0, t)
        const end = t + ttl
        if (end > 0 && end > start) {
          rawCues.push({
            start,
            end,
            text: formatMessage(c, isVtt),
          })
        }
      }
    } else {
      // Stack mode: Sweep interval over time boundaries
      interface ChatEntry {
        tEnter: number
        tExit: number
        text: string
      }
      const timedChats: ChatEntry[] = []
      const timePoints = new Set<number>()
      timePoints.add(0)

      for (const c of chats) {
        const tEnter = (c.ts - startedAtMs) / 1000 + offset
        const tExit = tEnter + ttl
        if (tExit <= 0) continue
        timedChats.push({
          tEnter,
          tExit,
          text: formatMessage(c, isVtt),
        })
        if (tEnter >= 0) timePoints.add(tEnter)
        timePoints.add(tExit)
      }

      const sortedTimes = Array.from(timePoints).sort((a, b) => a - b)

      for (let i = 0; i < sortedTimes.length - 1; i++) {
        const tStart = sortedTimes[i]
        const tEnd = sortedTimes[i + 1]
        if (tEnd <= tStart) continue

        // Active chats during interval [tStart, tEnd]
        const active = timedChats.filter(
          (c) => c.tEnter <= tStart && c.tExit >= tEnd
        )
        if (active.length === 0) continue

        const displayed = active.slice(-lines).map((c) => c.text).join('\n')
        rawCues.push({ start: tStart, end: tEnd, text: displayed })
      }
    }

    // Merge adjacent identical cues and clamp min duration
    const mergedCues: SubCue[] = []
    for (const cue of rawCues) {
      if (cue.end - cue.start <= 0) continue
      const prev = mergedCues.at(-1)
      if (prev && prev.text === cue.text && Math.abs(prev.end - cue.start) < 0.05) {
        prev.end = cue.end
      } else {
        // Enforce minimum cue duration of 0.3s if space allows
        const minEnd = Math.max(cue.end, cue.start + 0.3)
        mergedCues.push({ start: cue.start, end: minEnd, text: cue.text })
      }
    }

    if (isVtt) {
      const out = ['WEBVTT', '']
      mergedCues.forEach((cue, idx) => {
        out.push(String(idx + 1))
        out.push(`${formatTimeVtt(cue.start)} --> ${formatTimeVtt(cue.end)}`)
        out.push(cue.text)
        out.push('')
      })
      return {
        content: out.join('\n'),
        filename: `chat-${sessionId}.vtt`,
        contentType: 'text/vtt; charset=utf-8',
      }
    } else {
      const out: string[] = []
      mergedCues.forEach((cue, idx) => {
        out.push(String(idx + 1))
        out.push(`${formatTimeSrt(cue.start)} --> ${formatTimeSrt(cue.end)}`)
        out.push(cue.text)
        out.push('')
      })
      return {
        content: out.join('\n'),
        filename: `chat-${sessionId}.srt`,
        contentType: 'text/plain; charset=utf-8',
      }
    }
  }
}
