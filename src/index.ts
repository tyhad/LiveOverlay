import { Elysia, t } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { ConnectorManager } from './connectors/manager'
import { Database } from 'bun:sqlite'
import { ControlStateStore, validateControlName, type ControlStateData } from './control-state'
import { migrateLegacyElement, normalizeChatBindings } from './scene-migration'
import { ChatHub } from './chat-hub'
import { NotifQueue } from './notif-queue'
import type { PlatformStatus, ChatEvent } from './chat-types'
import { loadPlatformConfigFile, savePlatformConfigFile } from './platform-config-store'
import type { PlatformConfigV2 } from './platform-config'
import { ChatArchiveManager } from './chat-archive'
import { SceneStore, createDefaultScene, writeFileAtomic, type SceneData } from './scene-store'

const F1_DB_PATH = process.env.F1_DB_PATH || '../F1GStats/f1gstats.sqlite'
const F1_TEMPLATES_FILE = 'f1-text-templates.json'
const SCENES_FILE = 'scenes.json'
const LIVE_STATS_FILE = 'live-stats.json'
const EXAMPLE_LIVE_STATS_FILE = 'live-stats.example.json'
const CONTROL_STATE_FILE = 'control-state.json'
const PLATFORM_CONFIG_FILE = 'platform-config.json'
const ASSET_DIRECTORY = 'public/uploads'
const SETTINGS_SECRET = process.env.SETTINGS_SECRET
const PORT = Number(process.env.PORT || 3000)
const HOST = process.env.HOST || '127.0.0.1'
const MAX_ASSET_SIZE = 10 * 1024 * 1024
const MAX_SCENE_BODY_BYTES = 5 * 1024 * 1024
// Upper bound for any request (asset uploads allow 10 MB multipart). Scenes have
// their own smaller check in the route.
const MAX_REQUEST_BODY_BYTES = 12 * 1024 * 1024
const DEFAULT_PLATFORM_POLL_INTERVAL_MS = 30_000
const ASSET_MIME_TYPES = new Map([
  ['image/svg+xml', 'svg'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

const chatNotifQueue = new NotifQueue()
const chatArchive = new ChatArchiveManager()
// Di-set dari config v2 sebelum connector mulai. Saat false, chat tetap tampil
// di overlay tetapi tidak ditulis ke chat-archive/.
let chatArchiveEnabled = false
const chatHub = new ChatHub({
  notif: chatNotifQueue,
  onChat: (event: ChatEvent) => {
    if (chatArchiveEnabled) chatArchive.appendChat(event)
  },
})

type PlatformType = 'tiktok' | 'youtube'

interface ChatMessage {
  id: string
  author: string
  message: string
  receivedAt: string
}

interface ChatMessageInput {
  id?: string
  author: string
  message: string
  receivedAt?: string
}

interface LiveStatsData {
  platform: string
  username: string
  displayName: string
  viewerCount: number
  followerCount: number
  likeCount: number
  latestChatAuthor: string
  latestChatMessage: string
  isLive: boolean
  lastUpdatedAt: string
  chatMessages: ChatMessage[]
}

interface LiveStatsUpdate {
  platform?: string
  username?: string
  displayName?: string
  viewerCount?: number
  followerCount?: number
  likeCount?: number
  latestChatAuthor?: string
  latestChatMessage?: string
  isLive?: boolean
  lastUpdatedAt?: string
  chatMessages?: ChatMessageInput[]
}

// ─── F1GStats (read-only local database) ─────────────────────────────────────

interface F1Session {
  round: number
  raceName: string
  sessionType: string
  startTimeUtc: string
  circuitName: string
  countryFlag: string
  roundRelation: 'previous' | 'now' | 'next' | null
}

interface F1RoundInfo {
  round: number
  raceName: string
  circuitName: string
  countryFlag: string
  sessions: { sessionType: string; startTimeUtc: string }[]
}

interface F1DriverStanding {
  position: number
  driverName: string
  driverAbbr: string
  teamName: string
  points: number
  wins: number
  podiums: number
  dnfDns: number
}

interface F1ConstructorStanding {
  position: number
  teamName: string
  points: number
  wins: number
  podiums: number
  dnfDns: number
}

interface F1StartingGridEntry {
  round: number
  roundRelation: 'previous' | 'now' | 'next' | null
  position: number
  driverName: string
  driverAbbr: string
  teamName: string
}

interface F1GroupedText {
  abbrMultiline: string
  abbrMarquee: string
  fullMultiline: string
  fullMarquee: string
}

interface F1StartingGridText {
  multiline: string
  marquee: string
}

interface F1ScheduleText {
  previousMultiline: string
  previousMarquee: string
  nowMultiline: string
  nowMarquee: string
  nextMultiline: string
  nextMarquee: string
}

interface F1DataSnapshot {
  season: string | null
  lastFetchedAt: string | null
  previousRound: F1RoundInfo | null
  nowRound: F1RoundInfo | null
  nextRound: F1RoundInfo | null
  driverStandings: F1DriverStanding[]
  constructorStandings: F1ConstructorStanding[]
  driverStandingsText: F1GroupedText
  constructorStandingsText: F1GroupedText
  startingGrid: F1StartingGridEntry[]
  startingGridText: F1StartingGridText
  scheduleText: F1ScheduleText
  available: boolean
  error: string | null
}

// Mapping nama tim -> singkatan 3(-ish) huruf. Tidak ada sumber resmi dari
// Ergast/FastF1 untuk ini, jadi dibuat manual. Tambahkan barisnya kalau ada
// tim baru yang belum masuk daftar.
const TEAM_NAME_TO_ABBR: Record<string, string> = {
  'mercedes': 'MER',
  'ferrari': 'FER',
  'mclaren': 'MCL',
  'red bull': 'RBR',
  'red bull racing': 'RBR',
  'alpine f1 team': 'ALP',
  'alpine': 'ALP',
  'rb f1 team': 'VCA',
  'racing bulls': 'VCA',
  'haas f1 team': 'HAA',
  'haas': 'HAA',
  'audi': 'AUD',
  'williams': 'WIL',
  'aston martin': 'AST',
  'cadillac f1 team': 'CAD',
  'cadillac': 'CAD',
  'sauber': 'SAU',
  'kick sauber': 'SAU',
  'alphatauri': 'AT',
  'alfa romeo': 'ALF',
}

function teamAbbr(teamName: string): string {
  if (!teamName) return ''
  return TEAM_NAME_TO_ABBR[teamName.trim().toLowerCase()] || teamName.slice(0, 3).toUpperCase()
}

// ─── F1 Text Templates (editable format tanpa perlu edit kode) ──────────────
//
// Latar belakang: format teks F1 (starting grid, standings, schedule) tadinya
// hardcoded di sini, jadi tiap mau ganti kombinasi field (mis. driverAbbr ->
// driverName) harus edit TS + rebuild. Sekarang formatnya dibaca dari file
// `f1-text-templates.json` (opsional, di-gitignore, mirip pola scenes.json) —
// placeholder `{field}` di-substitusi dari data baris terkait. File di-reload
// otomatis kalau berubah (cek mtime), TIDAK butuh restart server. Kalau file
// tidak ada/rusak/field kosong, fallback graceful ke default di bawah —
// fitur ini sengaja opsional, tidak wajib setup.
interface F1TextTemplates {
  driverStandings: { abbrLine: string; fullLine: string }
  constructorStandings: { abbrLine: string; fullLine: string }
  startingGrid: { line: string }
  schedule: { header: string; sessionLine: string }
  separators: { multiline: string; marquee: string }
}

const DEFAULT_F1_TEMPLATES: F1TextTemplates = {
  driverStandings: {
    abbrLine: '#{position} {driverAbbr} {teamAbbr} {points}pts',
    fullLine: '#{position} {driverName} ({teamName}) {points}pts | {wins} Wins, {podiums} Podiums, {dnfDns} DNF',
  },
  constructorStandings: {
    abbrLine: '#{position} {teamAbbr} {points}pts',
    fullLine: '#{position} {teamName} {points}pts | {wins} Wins, {podiums} Podiums, {dnfDns} DNF',
  },
  startingGrid: {
    line: 'P{position} {driverAbbr} {teamAbbr}',
  },
  schedule: {
    header: '{raceName} {countryFlag} — {circuitName}',
    sessionLine: '{sessionType}: {startTimeWib}',
  },
  separators: {
    multiline: '\n',
    marquee: ' • ',
  },
}

let cachedF1Templates: F1TextTemplates = DEFAULT_F1_TEMPLATES
let cachedF1TemplatesMtimeMs: number | null = null

function mergeF1Templates(override: any): F1TextTemplates {
  const o = override && typeof override === 'object' ? override : {}
  return {
    driverStandings: { ...DEFAULT_F1_TEMPLATES.driverStandings, ...(o.driverStandings || {}) },
    constructorStandings: { ...DEFAULT_F1_TEMPLATES.constructorStandings, ...(o.constructorStandings || {}) },
    startingGrid: { ...DEFAULT_F1_TEMPLATES.startingGrid, ...(o.startingGrid || {}) },
    schedule: { ...DEFAULT_F1_TEMPLATES.schedule, ...(o.schedule || {}) },
    separators: { ...DEFAULT_F1_TEMPLATES.separators, ...(o.separators || {}) },
  }
}

function getF1TextTemplates(): F1TextTemplates {
  try {
    const stat = statSync(F1_TEMPLATES_FILE)
    if (cachedF1TemplatesMtimeMs === stat.mtimeMs) return cachedF1Templates
    const raw = JSON.parse(readFileSync(F1_TEMPLATES_FILE, 'utf-8'))
    cachedF1Templates = mergeF1Templates(raw)
    cachedF1TemplatesMtimeMs = stat.mtimeMs
    return cachedF1Templates
  } catch {
    // File tidak ada, tidak bisa dibaca, atau JSON rusak -> fallback ke default
    // (atau ke cache terakhir yang valid kalau sempat sukses di-load sebelumnya).
    return cachedF1Templates
  }
}

/** Substitusi placeholder `{key}` di template dengan `data[key]`. Placeholder
 *  yang tidak dikenal (typo field) dibiarkan apa adanya (tidak dihapus diam-diam)
 *  supaya user gampang sadar ada typo saat lihat hasil overlay-nya. */
function renderF1Template(template: string, data: Record<string, unknown>): string {
  if (typeof template !== 'string') return ''
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in data)) return match
    const value = data[key]
    return value === undefined || value === null ? '' : String(value)
  })
}

function buildDriverStandingsText(rows: F1DriverStanding[], templates: F1TextTemplates): F1GroupedText {
  const abbrLines = rows.map((d) =>
    renderF1Template(templates.driverStandings.abbrLine, { ...d, teamAbbr: teamAbbr(d.teamName) })
  )
  const fullLines = rows.map((d) =>
    renderF1Template(templates.driverStandings.fullLine, { ...d, teamAbbr: teamAbbr(d.teamName) })
  )
  return {
    abbrMultiline: abbrLines.join(templates.separators.multiline),
    abbrMarquee: abbrLines.join(templates.separators.marquee),
    fullMultiline: fullLines.join(templates.separators.multiline),
    fullMarquee: fullLines.join(templates.separators.marquee),
  }
}

function buildConstructorStandingsText(rows: F1ConstructorStanding[], templates: F1TextTemplates): F1GroupedText {
  const abbrLines = rows.map((c) =>
    renderF1Template(templates.constructorStandings.abbrLine, { ...c, teamAbbr: teamAbbr(c.teamName) })
  )
  const fullLines = rows.map((c) =>
    renderF1Template(templates.constructorStandings.fullLine, { ...c, teamAbbr: teamAbbr(c.teamName) })
  )
  return {
    abbrMultiline: abbrLines.join(templates.separators.multiline),
    abbrMarquee: abbrLines.join(templates.separators.marquee),
    fullMultiline: fullLines.join(templates.separators.multiline),
    fullMarquee: fullLines.join(templates.separators.marquee),
  }
}

function buildStartingGridText(rows: F1StartingGridEntry[], templates: F1TextTemplates): F1StartingGridText {
  const lines = rows.map((g) =>
    renderF1Template(templates.startingGrid.line, { ...g, teamAbbr: teamAbbr(g.teamName) })
  )
  return {
    multiline: lines.join(templates.separators.multiline),
    marquee: lines.join(templates.separators.marquee),
  }
}

function pickStartingGridForDisplay(rows: F1StartingGridEntry[]): F1StartingGridEntry[] {
  // Prioritaskan grid utk round 'now', lalu 'next', lalu 'previous' (kalau
  // now/next belum ada qualifying-nya). Kalau semua kosong, kembalikan [].
  for (const relation of ['now', 'next', 'previous'] as const) {
    const match = rows.filter((r) => r.roundRelation === relation)
    if (match.length > 0) return match.sort((a, b) => a.position - b.position)
  }
  return []
}

function buildRoundGroup(rows: F1Session[], relation: 'previous' | 'now' | 'next'): F1RoundInfo | null {
  const relevant = rows.filter((row) => row.roundRelation === relation)
  const first = relevant[0]
  if (!first) return null
  return {
    round: first.round,
    raceName: first.raceName,
    circuitName: first.circuitName,
    countryFlag: first.countryFlag,
    sessions: relevant.map((row) => ({ sessionType: row.sessionType, startTimeUtc: row.startTimeUtc })),
  }
}

function formatSessionTimeWib(iso: string): string {
  try {
    const d = new Date(iso)
    const day = d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Jakarta' })
    const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jakarta' })
    return `${day} ${time} WIB`
  } catch {
    return iso
  }
}

function buildRoundText(round: F1RoundInfo | null, templates: F1TextTemplates): { multiline: string; marquee: string } {
  if (!round) return { multiline: '', marquee: '' }
  const header = renderF1Template(templates.schedule.header, { ...round }).trim()
  const sessionLines = round.sessions.map((s) =>
    renderF1Template(templates.schedule.sessionLine, { ...s, startTimeWib: formatSessionTimeWib(s.startTimeUtc) })
  )
  return {
    multiline: [header, ...sessionLines].join(templates.separators.multiline),
    marquee: [header, ...sessionLines].join(templates.separators.marquee),
  }
}

function buildScheduleText(
  previousRound: F1RoundInfo | null,
  nowRound: F1RoundInfo | null,
  nextRound: F1RoundInfo | null,
  templates: F1TextTemplates
): F1ScheduleText {
  const previous = buildRoundText(previousRound, templates)
  const now = buildRoundText(nowRound, templates)
  const next = buildRoundText(nextRound, templates)
  return {
    previousMultiline: previous.multiline,
    previousMarquee: previous.marquee,
    nowMultiline: now.multiline,
    nowMarquee: now.marquee,
    nextMultiline: next.multiline,
    nextMarquee: next.marquee,
  }
}

const EMPTY_SCHEDULE_TEXT: F1ScheduleText = {
  previousMultiline: '',
  previousMarquee: '',
  nowMultiline: '',
  nowMarquee: '',
  nextMultiline: '',
  nextMarquee: '',
}

const EMPTY_GROUPED_TEXT: F1GroupedText = {
  abbrMultiline: '',
  abbrMarquee: '',
  fullMultiline: '',
  fullMarquee: '',
}

const EMPTY_GRID_TEXT: F1StartingGridText = {
  multiline: '',
  marquee: '',
}

let f1Db: Database | null = null
let f1DbMtimeMs: number | null = null
let f1DbInitError: string | null = null

function getF1Db(): Database | null {
  let mtimeMs: number
  try {
    mtimeMs = statSync(F1_DB_PATH).mtimeMs
  } catch {
    if (f1Db) {
      try { f1Db.close() } catch {}
    }
    f1Db = null
    f1DbMtimeMs = null
    return null
  }
  if (f1Db && f1DbMtimeMs === mtimeMs) return f1Db

  // Fetcher menulis file baru lalu rename; handle lama akan menunjuk file lama,
  // jadi buka ulang setiap mtime berubah (dan biarkan error lama tidak menetap).
  if (f1Db) {
    try { f1Db.close() } catch {}
  }
  f1Db = null
  try {
    f1Db = new Database(F1_DB_PATH, { readonly: true })
    f1DbMtimeMs = mtimeMs
    f1DbInitError = null
    return f1Db
  } catch (err) {
    f1DbInitError = err instanceof Error ? err.message : 'Failed to open F1GStats database'
    console.warn(`[f1gstats] Could not open database at ${F1_DB_PATH}: ${f1DbInitError}`)
    return null
  }
}

function getF1DataSnapshot(): F1DataSnapshot {
  const db = getF1Db()
  if (!db) {
    return {
      season: null,
      lastFetchedAt: null,
      previousRound: null,
      nowRound: null,
      nextRound: null,
      driverStandings: [],
      constructorStandings: [],
      driverStandingsText: EMPTY_GROUPED_TEXT,
      constructorStandingsText: EMPTY_GROUPED_TEXT,
      startingGrid: [],
      startingGridText: EMPTY_GRID_TEXT,
      scheduleText: EMPTY_SCHEDULE_TEXT,
      available: false,
      error: f1DbInitError || 'F1GStats database not found',
    }
  }

  try {
    const metaRows = db.query('SELECT key, value FROM meta').all() as { key: string; value: string }[]
    const meta = Object.fromEntries(metaRows.map((row) => [row.key, row.value]))

    const sessionRows = db.query(`
      SELECT round, race_name as raceName, session_type as sessionType,
             start_time_utc as startTimeUtc, circuit_name as circuitName, country_flag as countryFlag,
             round_relation as roundRelation
      FROM sessions ORDER BY start_time_utc ASC
    `).all() as F1Session[]

    const driverStandings = db.query(`
      SELECT position, driver_name as driverName, driver_abbr as driverAbbr, team_name as teamName,
             points, wins, podiums, dnf_dns as dnfDns
      FROM driver_standings ORDER BY position ASC
    `).all() as F1DriverStanding[]

    const constructorStandings = db.query(`
      SELECT position, team_name as teamName, points, wins, podiums, dnf_dns as dnfDns
      FROM constructor_standings ORDER BY position ASC
    `).all() as F1ConstructorStanding[]

    let startingGridRows: F1StartingGridEntry[] = []
    try {
      startingGridRows = db.query(`
        SELECT round, round_relation as roundRelation, position,
               driver_name as driverName, driver_abbr as driverAbbr, team_name as teamName
        FROM starting_grid ORDER BY position ASC
      `).all() as F1StartingGridEntry[]
    } catch {
      // Tabel starting_grid belum ada (database lama sebelum update) -> anggap kosong.
      startingGridRows = []
    }
    const startingGrid = pickStartingGridForDisplay(startingGridRows)

    const previousRound = buildRoundGroup(sessionRows, 'previous')
    const nowRound = buildRoundGroup(sessionRows, 'now')
    const nextRound = buildRoundGroup(sessionRows, 'next')
    const templates = getF1TextTemplates()

    return {
      season: meta.season || null,
      lastFetchedAt: meta.last_fetched_at || null,
      previousRound,
      nowRound,
      nextRound,
      driverStandings,
      constructorStandings,
      driverStandingsText: buildDriverStandingsText(driverStandings, templates),
      constructorStandingsText: buildConstructorStandingsText(constructorStandings, templates),
      startingGrid,
      startingGridText: buildStartingGridText(startingGrid, templates),
      scheduleText: buildScheduleText(previousRound, nowRound, nextRound, templates),
      available: true,
      error: null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read F1GStats database'
    return {
      season: null,
      lastFetchedAt: null,
      previousRound: null,
      nowRound: null,
      nextRound: null,
      driverStandings: [],
      constructorStandings: [],
      driverStandingsText: EMPTY_GROUPED_TEXT,
      constructorStandingsText: EMPTY_GROUPED_TEXT,
      startingGrid: [],
      startingGridText: EMPTY_GRID_TEXT,
      scheduleText: EMPTY_SCHEDULE_TEXT,
      available: false,
      error: message,
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const sceneStore = new SceneStore(SCENES_FILE)

const DEFAULT_LIVE_STATS: LiveStatsData = {
  platform: 'TikTok Live',
  username: '@creator',
  displayName: 'Creator Stream',
  viewerCount: 128,
  followerCount: 12450,
  likeCount: 98320,
  latestChatAuthor: 'setyo.design',
  latestChatMessage: 'Overlay baru ini clean banget!',
  isLive: true,
  lastUpdatedAt: new Date().toISOString(),
  chatMessages: [
    {
      id: 'chat_1',
      author: 'setyo.design',
      message: 'Overlay baru ini clean banget!',
      receivedAt: new Date().toISOString(),
    },
  ],
}

function normalizeLiveStats(data: LiveStatsUpdate | Partial<LiveStatsData>): LiveStatsData {
  const nextChatMessages = Array.isArray(data.chatMessages)
    ? data.chatMessages
      .filter((message): message is ChatMessage => !!message && typeof message === 'object')
      .slice(-25)
      .map((message, index) => ({
        id: message.id || `chat_${index + 1}`,
        author: message.author || 'viewer',
        message: message.message || '',
        receivedAt: message.receivedAt || new Date().toISOString(),
      }))
    : DEFAULT_LIVE_STATS.chatMessages

  return {
    platform: data.platform || DEFAULT_LIVE_STATS.platform,
    username: data.username || DEFAULT_LIVE_STATS.username,
    displayName: data.displayName || DEFAULT_LIVE_STATS.displayName,
    viewerCount: Number.isFinite(data.viewerCount) ? Number(data.viewerCount) : DEFAULT_LIVE_STATS.viewerCount,
    followerCount: Number.isFinite(data.followerCount) ? Number(data.followerCount) : DEFAULT_LIVE_STATS.followerCount,
    likeCount: Number.isFinite(data.likeCount) ? Number(data.likeCount) : DEFAULT_LIVE_STATS.likeCount,
    latestChatAuthor: data.latestChatAuthor || nextChatMessages.at(-1)?.author || DEFAULT_LIVE_STATS.latestChatAuthor,
    latestChatMessage: data.latestChatMessage || nextChatMessages.at(-1)?.message || DEFAULT_LIVE_STATS.latestChatMessage,
    isLive: typeof data.isLive === 'boolean' ? data.isLive : DEFAULT_LIVE_STATS.isLive,
    lastUpdatedAt: data.lastUpdatedAt || new Date().toISOString(),
    chatMessages: nextChatMessages,
  }
}

let liveStatsMemoryCache: LiveStatsData | null = null
let liveStatsDebounceTimer: ReturnType<typeof setTimeout> | null = null

async function getLiveStats(): Promise<LiveStatsData> {
  if (liveStatsMemoryCache) return liveStatsMemoryCache

  const file = Bun.file(LIVE_STATS_FILE)
  if (await file.exists()) {
    try {
      const text = await file.text()
      liveStatsMemoryCache = normalizeLiveStats(JSON.parse(text))
      return liveStatsMemoryCache
    } catch {
      // Fallback if parsing fails
    }
  }

  const exampleFile = Bun.file(EXAMPLE_LIVE_STATS_FILE)
  if (await exampleFile.exists()) {
    try {
      const initialStats = normalizeLiveStats(JSON.parse(await exampleFile.text()))
      await writeFileAtomic(LIVE_STATS_FILE, JSON.stringify(initialStats, null, 2))
      liveStatsMemoryCache = initialStats
      return initialStats
    } catch {
      // Fallback
    }
  }

  await writeFileAtomic(LIVE_STATS_FILE, JSON.stringify(DEFAULT_LIVE_STATS, null, 2))
  liveStatsMemoryCache = DEFAULT_LIVE_STATS
  return DEFAULT_LIVE_STATS
}

async function saveLiveStats(data: LiveStatsUpdate): Promise<LiveStatsData> {
  const current = await getLiveStats()
  const nextChatMessages = Array.isArray(data.chatMessages) && data.chatMessages.length > 0
    ? data.chatMessages
    : current.chatMessages

  const updated = normalizeLiveStats({
    ...current,
    ...data,
    chatMessages: nextChatMessages,
    lastUpdatedAt: new Date().toISOString(),
  })

  if (data.latestChatMessage || data.latestChatAuthor) {
    const author = data.latestChatAuthor || updated.latestChatAuthor
    const message = data.latestChatMessage || updated.latestChatMessage
    updated.latestChatAuthor = author
    updated.latestChatMessage = message
    updated.chatMessages = [
      ...updated.chatMessages,
      {
        id: `chat_${Date.now()}`,
        author,
        message,
        receivedAt: updated.lastUpdatedAt,
      },
    ].slice(-25)
  }

  liveStatsMemoryCache = updated

  if (!liveStatsDebounceTimer) {
    liveStatsDebounceTimer = setTimeout(async () => {
      liveStatsDebounceTimer = null
      if (liveStatsMemoryCache) {
        try {
          await writeFileAtomic(LIVE_STATS_FILE, JSON.stringify(liveStatsMemoryCache, null, 2))
        } catch {
          // Best effort
        }
      }
    }, 2000)
  }

  return updated
}

const controlStateStore = new ControlStateStore({
  load: async () => {
    const file = Bun.file(CONTROL_STATE_FILE)
    if (!(await file.exists())) return null
    return JSON.parse(await file.text())
  },
  save: async (state) => { await writeFileAtomic(CONTROL_STATE_FILE, JSON.stringify(state, null, 2)) },
})

function rejectInvalidControlName(name: string, set: { status?: unknown }): boolean {
  const message = validateControlName(name)
  if (!message) return false
  set.status = 400
  return true
}
async function listAssets() {
  try {
    const names = await readdir(ASSET_DIRECTORY)
    return names
      .filter((name) => !name.startsWith('.'))
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        id: name,
        name: name.replace(/^[a-f0-9-]+_/i, ''),
        url: `/uploads/${encodeURIComponent(name)}`,
      }))
  } catch {
    return []
  }
}

async function deleteAsset(assetId: string): Promise<boolean> {
  const safeId = basename(String(assetId || ''))
  if (!safeId || safeId === '.' || safeId === '..') return false

  const filePath = `${ASSET_DIRECTORY}/${safeId}`
  const file = Bun.file(filePath)
  if (!(await file.exists())) return false

  await unlink(filePath)
  return true
}

// ─── Platform Live Stats Connector ───────────────────────────────────────────

const connectorManager = new ConnectorManager({
  chatHub,
  onStatsUpdate: async (stats) => {
    await saveLiveStats(stats)
    // Satu file arsip per stream: tutup sesi begitu semua platform berhenti live,
    // supaya stream berikutnya tidak menumpang startedAt stream sebelumnya.
    const anyLive = currentPlatformStatus('tiktok').isLive || currentPlatformStatus('youtube').isLive
    if (stats.isLive === false && !anyLive && chatArchive.getActiveSessionId()) {
      await chatArchive.endSession()
    }
  },
})

function currentPlatformStatus(platform: PlatformType): PlatformStatus {
  return connectorManager.getPlatformStatus(platform)
}

function schedulePlatformConnectors(config: PlatformConfigV2): void {
  chatNotifQueue.configure(config.notif)
  const anyEnabled = config.tiktok.enabled || config.youtube.enabled
  chatArchiveEnabled = Boolean(config.archive.enabled)
  // D4: sesi arsip hidup selama minimal satu connector aktif dan arsip tidak
  // dimatikan lewat toggle editor. Stop Semua / archive off menutup sesi aktif
  // supaya daftar sesi di /control menandainya selesai.
  if (!chatArchiveEnabled || !anyEnabled) {
    if (chatArchive.getActiveSessionId()) void chatArchive.endSession()
  } else if (!chatArchive.getActiveSessionId()) {
    void chatArchive.startSession()
  }
  connectorManager.applyConfig(config)
}

// Initialize both connectors independently from persisted config.
loadPlatformConfigFile(PLATFORM_CONFIG_FILE).then((config) => {
  schedulePlatformConnectors(config)
}).catch((err) => {
  console.warn('[platform-connector] Failed to load config on startup:', err)
})

// ─────────────────────────────────────────────────────────────────────────────

const app = new Elysia({ serve: { maxRequestBodySize: MAX_REQUEST_BODY_BYTES } })
  .onBeforeHandle(({ request, headers, set }) => {
    if (!SETTINGS_SECRET || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return

    const authHeader = headers['authorization'] || headers['x-secret-token']
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    if (token !== SETTINGS_SECRET) {
      set.status = 401
      return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
    }
  })
  .onAfterHandle(({ request, set }) => {
    // Uploaded files are same-origin; an SVG with <script> must never execute.
    if (new URL(request.url).pathname.startsWith('/uploads/')) {
      set.headers['Content-Security-Policy'] = 'sandbox'
      set.headers['X-Content-Type-Options'] = 'nosniff'
    }
  })
  .get('/', () => Bun.file('public/index.html'))
  .get('/control', () => Bun.file('public/control.html'))
  .get('/api/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'LiveOverlay Studio Backend Ready',
  }))
  .get('/api/chat/feed', ({ query }) => {
    return { ...chatHub.since(Number(query.since), Number(query.limit)), notif: chatNotifQueue.getSnapshot(), status: { tiktok: currentPlatformStatus('tiktok'), youtube: currentPlatformStatus('youtube') } }
  })
  .get('/api/chat/status', () => ({ tiktok: currentPlatformStatus('tiktok'), youtube: currentPlatformStatus('youtube') }))
  // Dev-only helper for manual C6 acceptance: inject a synthetic chat into the
  // same hub/notification/archive pipeline the real connectors use.
  .post(
    '/api/chat/dev-inject',
    ({ body, set }) => {
      if (process.env.NODE_ENV === 'production' && process.env.CHAT_DEV_INJECT !== '1') {
        set.status = 404
        return { success: false, message: 'Not found' }
      }

      const platform = body.platform === 'youtube' ? 'youtube' : 'tiktok'
      const message = String(body.message || '').trim()
      if (!message) {
        set.status = 400
        return { success: false, message: '"message" is required' }
      }

      const event = chatHub.push({
        id: `dev-${Date.now()}-${crypto.randomUUID()}`,
        platform,
        author: String(body.author || 'tester').trim() || 'tester',
        message,
      })
      return { success: true, event, notif: chatNotifQueue.getSnapshot() }
    },
    {
      body: t.Object({
        platform: t.Optional(t.String()),
        author: t.Optional(t.String()),
        message: t.String(),
      }),
    }
  )
  // ─── Chat Archive Endpoints ───────────────────────────────────────────────
  .get('/api/chat/archive', async ({ headers, set }) => {
    if (SETTINGS_SECRET) {
      const token = (headers['authorization'] || headers['x-secret-token'])?.replace(/^Bearer\s+/i, '')
      if (token !== SETTINGS_SECRET) { set.status = 401; return { success: false, message: 'Unauthorized' } }
    }
    return { sessions: await chatArchive.listSessions() }
  })
  .post('/api/chat/archive/session/end', async ({ set }) => {
    const sessionId = chatArchive.getActiveSessionId()
    if (!sessionId) {
      set.status = 404
      return { success: false, message: 'No active archive session' }
    }
    await chatArchive.endSession()
    return { success: true, sessionId }
  })
  .get('/api/chat/archive/:id/chats', async ({ params, query, headers, set }) => {
    if (SETTINGS_SECRET) {
      const token = (headers['authorization'] || headers['x-secret-token'])?.replace(/^Bearer\s+/i, '')
      if (token !== SETTINGS_SECRET) { set.status = 401; return { success: false, message: 'Unauthorized' } }
    }
    try {
      const offset = Math.max(0, Number(query.offset) || 0)
      const limit = Math.max(1, Math.min(500, Number(query.limit) || 50))
      return await chatArchive.getSessionChats(params.id, offset, limit)
    } catch (err: any) {
      set.status = 404
      return { success: false, message: err.message }
    }
  })
  .get('/api/chat/archive/:id/align', async ({ params, query, headers, set }) => {
    if (SETTINGS_SECRET) {
      const token = (headers['authorization'] || headers['x-secret-token'])?.replace(/^Bearer\s+/i, '')
      if (token !== SETTINGS_SECRET) { set.status = 401; return { success: false, message: 'Unauthorized' } }
    }
    const chatSeq = Number(query.chatSeq)
    const videoTime = String(query.videoTime || '')
    if (!chatSeq || !videoTime) {
      set.status = 400
      return { success: false, message: 'chatSeq and videoTime are required' }
    }
    try {
      return await chatArchive.calculateAlignment(params.id, chatSeq, videoTime)
    } catch (err: any) {
      set.status = 404
      return { success: false, message: err.message }
    }
  })
  .get('/api/chat/archive/:id/export', async ({ params, query, headers, set }) => {
    if (SETTINGS_SECRET) {
      const token = (headers['authorization'] || headers['x-secret-token'])?.replace(/^Bearer\s+/i, '')
      if (token !== SETTINGS_SECRET) { set.status = 401; return { success: false, message: 'Unauthorized' } }
    }
    try {
      const result = await chatArchive.exportSession(params.id, {
        format: (query.format as any) || 'srt',
        offset: Number(query.offset) || 0,
        mode: (query.mode as any) || 'stack',
        lines: Number(query.lines) || 5,
        ttl: Number(query.ttl) || 8,
        tags: query.tags === undefined ? true : Number(query.tags) !== 0,
      })
      set.headers = {
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
      }
      return new Response(result.content, {
        headers: {
          'Content-Type': result.contentType,
          'Content-Disposition': `attachment; filename="${result.filename}"`,
        },
      })
    } catch (err: any) {
      set.status = 404
      return { success: false, message: err.message }
    }
  })
  // NOTE: /api/settings is intentionally removed — it was dead code from the
  // pre-scene-system era. Use /api/live-stats and /api/scenes instead.
  .get('/api/platform-connector', async () => {
    const configV2 = await loadPlatformConfigFile(PLATFORM_CONFIG_FILE)
    return {
      configV2,
      statusV2: { tiktok: currentPlatformStatus('tiktok'), youtube: currentPlatformStatus('youtube') },
    }
  })
  .post(
    '/api/platform-connector',
    async ({ body }) => {
      const configV2 = await savePlatformConfigFile(PLATFORM_CONFIG_FILE, body as any)
      schedulePlatformConnectors(configV2)

      return {
        success: true,
        message: 'Platform connector config saved',
        statusV2: connectorManager.getStatus(),
        configV2,
      }
    },
    {
      body: t.Object({
        tiktok: t.Optional(t.Any()),
        youtube: t.Optional(t.Any()),
        stats: t.Optional(t.Any()),
        notif: t.Optional(t.Any()),
        chatFormat: t.Optional(t.Any()),
        archive: t.Optional(t.Any()),
      }),
    }
  )

  .get('/api/scenes', async () => {
    const scenes = await sceneStore.getScenes()
    return {
      scenes,
      activeSceneId: scenes[0]?.id || null,
      activeScene: scenes[0] || createDefaultScene(),
    }
  })
  .get('/api/scenes/:id', async ({ params, set }) => {
    const scene = await sceneStore.getById(params.id)
    if (!scene) {
      set.status = 404
      return { success: false, message: 'Scene not found' }
    }
    return scene
  })
  .get('/api/live-stats', async () => {
    return await getLiveStats()
  })
  .get('/api/control-state', async () => {
    return await controlStateStore.read()
  })
  .post(
    '/api/control-state/counters/:name/inc',
    async ({ params, set }) => {
      if (rejectInvalidControlName(params.name, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const data = await controlStateStore.bumpCounter(params.name, 1)
      return { success: true, data }
    }
  )
  .post(
    '/api/control-state/counters/:name/dec',
    async ({ params, set }) => {
      if (rejectInvalidControlName(params.name, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const data = await controlStateStore.bumpCounter(params.name, -1)
      return { success: true, data }
    }
  )
  .post(
    '/api/control-state/counters/:name/reset',
    async ({ params, set }) => {
      if (rejectInvalidControlName(params.name, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const data = await controlStateStore.resetCounter(params.name)
      return { success: true, data }
    }
  )
  .post(
    '/api/control-state/counters/:name/set',
    async ({ params, body, set }) => {
      if (rejectInvalidControlName(params.name, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const value = Number((body as { value?: number })?.value)
      if (!Number.isFinite(value)) {
        set.status = 400
        return { success: false, message: '"value" harus berupa angka' }
      }
      const data = await controlStateStore.setCounter(params.name, value)
      return { success: true, data }
    },
    { body: t.Object({ value: t.Numeric() }) }
  )
  .post(
    '/api/control-state/event-states/:group/set',
    async ({ params, body, set }) => {
      if (rejectInvalidControlName(params.group, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const value = (body as { value?: string })?.value
      if (typeof value !== 'string' || !value) {
        set.status = 400
        return { success: false, message: '"value" harus berupa string non-kosong' }
      }
      const data = await controlStateStore.setEventState(params.group, value)
      return { success: true, data }
    },
    { body: t.Object({ value: t.String() }) }
  )
  .post(
    '/api/control-state/texts/:name/set',
    async ({ params, body, set }) => {
      if (rejectInvalidControlName(params.name, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const data = await controlStateStore.setControlText(params.name, String((body as { value: string }).value ?? ''))
      return { success: true, data }
    },
    { body: t.Object({ value: t.String() }) }
  )
  .post(
    '/api/control-state/event-states/:group/options/add',
    async ({ params, body, set }) => {
      if (rejectInvalidControlName(params.group, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const option = String((body as { option?: string })?.option ?? '').trim()
      if (!option) {
        set.status = 400
        return { success: false, message: '"option" harus berupa string non-kosong' }
      }
      const data = await controlStateStore.addEventStateOption(params.group, option)
      return { success: true, data }
    },
    { body: t.Object({ option: t.String() }) }
  )
  .post(
    '/api/control-state/event-states/:group/options/color',
    async ({ params, body, set }) => {
      if (rejectInvalidControlName(params.group, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const { option, color } = body as { option: string; color: string }
      // Validasi sederhana: hex (#rgb/#rrggbb/#rrggbbaa) atau kosong (hapus warna)
      if (color && !/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(color.trim())) {
        set.status = 400
        return { success: false, message: '"color" harus berupa hex (mis. #ff0000) atau kosong' }
      }
      const data = await controlStateStore.setEventStateOptionColor(params.group, option, color)
      return { success: true, data }
    },
    { body: t.Object({ option: t.String(), color: t.String() }) }
  )
  .post(
    '/api/control-state/event-states/:group/options/remove',
    async ({ params, body, set }) => {
      if (rejectInvalidControlName(params.group, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const data = await controlStateStore.removeEventStateOption(params.group, (body as { option: string }).option)
      return { success: true, data }
    },
    { body: t.Object({ option: t.String() }) }
  )
  .post(
    '/api/control-state/timers/:name/start',
    async ({ params, body, set }) => {
      if (rejectInvalidControlName(params.name, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const { mode, durationMs, restart } = body as { mode?: string; durationMs?: number; restart?: boolean }
      const data = await controlStateStore.startTimer(
        params.name,
        mode === 'countdown' || mode === 'countup' ? mode : undefined,
        durationMs,
        restart === true
      )
      return { success: true, data }
    },
    {
      body: t.Object({
        mode: t.Optional(t.Union([t.Literal('countdown'), t.Literal('countup')])),
        durationMs: t.Optional(t.Numeric()),
        restart: t.Optional(t.Boolean()),
      }),
    }
  )
  .post(
    '/api/control-state/timers/:name/pause',
    async ({ params, set }) => {
      if (rejectInvalidControlName(params.name, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const data = await controlStateStore.pauseTimer(params.name)
      return { success: true, data }
    }
  )
  .post(
    '/api/control-state/timers/:name/reset',
    async ({ params, set }) => {
      if (rejectInvalidControlName(params.name, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const data = await controlStateStore.resetTimer(params.name)
      return { success: true, data }
    }
  )
  .post(
    '/api/control-state/timers/:name/configure',
    async ({ params, body, set }) => {
      if (rejectInvalidControlName(params.name, set)) return { success: false, message: 'Nama grup tidak valid: reserved atau lebih dari 64 karakter' }
      const { mode, durationMs, continueBelowZero } = body as {
        mode?: string
        durationMs?: number
        continueBelowZero?: boolean
      }
      const data = await controlStateStore.configureTimer(params.name, {
        mode: mode === 'countdown' || mode === 'countup' ? mode : undefined,
        durationMs,
        continueBelowZero,
      })
      return { success: true, data }
    },
    {
      body: t.Object({
        mode: t.Optional(t.Union([t.Literal('countdown'), t.Literal('countup')])),
        durationMs: t.Optional(t.Numeric()),
        continueBelowZero: t.Optional(t.Boolean()),
      }),
    }
  )
  .get('/api/f1-data', () => {
    return getF1DataSnapshot()
  })
  .get('/api/assets', async () => {
    return { assets: await listAssets() }
  })
  .post(
    '/api/assets',
    async ({ request, set }) => {
      const formData = await request.formData()
      const uploadedFile = formData.get('file')
      if (!(uploadedFile instanceof File)) {
        set.status = 400
        return { success: false, message: 'A multipart file field named "file" is required' }
      }

      const extension = ASSET_MIME_TYPES.get(uploadedFile.type)
      if (!extension) {
        set.status = 415
        return { success: false, message: 'Only SVG, PNG, JPEG, WEBP, and GIF assets are supported' }
      }
      if (uploadedFile.size === 0 || uploadedFile.size > MAX_ASSET_SIZE) {
        set.status = 413
        return { success: false, message: 'Asset must be between 1 byte and 10 MB' }
      }

      await mkdir(ASSET_DIRECTORY, { recursive: true })
      const originalName = uploadedFile.name.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^[-.]+/, '') || `asset.${extension}`
      const filename = `${crypto.randomUUID()}_${originalName.replace(/\.[^.]+$/, '')}.${extension}`
      await Bun.write(`${ASSET_DIRECTORY}/${filename}`, uploadedFile)

      return {
        success: true,
        asset: {
          id: filename,
          name: originalName,
          url: `/uploads/${encodeURIComponent(filename)}`,
        },
      }
    }
  )
  .delete(
    '/api/assets/:id',
    async ({ params, set }) => {
      const deleted = await deleteAsset(params.id)
      if (!deleted) {
        set.status = 404
        return { success: false, message: 'Asset not found' }
      }

      return { success: true, message: 'Asset deleted successfully' }
    }
  )

  .post(
    '/api/live-stats',
    async ({ body }) => {
      const updated = await saveLiveStats(body)
      return {
        success: true,
        message: 'Live stats updated successfully',
        data: updated,
      }
    },
    {
      body: t.Object({
        platform: t.Optional(t.String()),
        username: t.Optional(t.String()),
        displayName: t.Optional(t.String()),
        viewerCount: t.Optional(t.Numeric()),
        followerCount: t.Optional(t.Numeric()),
        likeCount: t.Optional(t.Numeric()),
        latestChatAuthor: t.Optional(t.String()),
        latestChatMessage: t.Optional(t.String()),
        isLive: t.Optional(t.Boolean()),
        chatMessages: t.Optional(
          t.Array(
            t.Object({
              id: t.Optional(t.String()),
              author: t.String(),
              message: t.String(),
              receivedAt: t.Optional(t.String()),
            })
          )
        ),
      }),
    }
  )
  .post(
    '/api/scenes',
    async ({ body, request, set }) => {
      if (Number(request.headers.get('content-length')) > MAX_SCENE_BODY_BYTES) {
        set.status = 413
        return { success: false, message: 'Scene payload must be at most 5 MB' }
      }

      try {
        const payload = body as { scene?: SceneData; originalId?: string }
        const updated = await sceneStore.save((payload.scene || body) as SceneData, payload.originalId)
        return {
          success: true,
          message: 'Scene saved successfully',
          data: updated,
        }
      } catch (error: any) {
        set.status = error?.status || 500
        return { success: false, message: error?.message || 'Failed to save scene' }
      }
    },
    {
      body: t.Object({
        scene: t.Any(),
        originalId: t.Optional(t.String()),
      }),
    }
  )
  .delete(
    '/api/scenes/:id',
    async ({ params, set }) => {
      try {
        const scenes = await sceneStore.delete(params.id)
        return {
          success: true,
          message: 'Scene deleted successfully',
          data: scenes,
        }
      } catch (error: any) {
        set.status = error?.status || 500
        return { success: false, message: error?.message || 'Failed to delete scene' }
      }
    }
  )
  .use(
    staticPlugin({
      assets: 'public',
      prefix: '',
      etag: true,
      directive: 'no-cache',
      maxAge: 0,
    })
  )
  .listen({
    port: PORT,
    hostname: HOST,
  })

console.log(`🦊 LiveOverlay Studio running at http://${app.server?.hostname}:${app.server?.port}`)

// Flush chat archive on graceful shutdown so no lines are lost
const handleShutdown = async () => {
  await chatArchive.flush()
  process.exit(0)
}
process.once('SIGINT', () => void handleShutdown())
process.once('SIGTERM', () => void handleShutdown())
