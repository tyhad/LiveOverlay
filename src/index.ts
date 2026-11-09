import { Elysia, t } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { readFileSync, statSync } from 'node:fs'
import { basename } from 'node:path'
import { ConnectorManager } from './connectors/manager'
import { Database } from 'bun:sqlite'
import { ControlStateStore, validateControlName, type ControlStateData } from './control-state'
import { migrateLegacyElement } from './scene-migration'
import { ChatHub } from './chat-hub'
import { NotifQueue } from './notif-queue'
import type { PlatformStatus, ChatEvent } from './chat-types'
import { loadPlatformConfigFile, savePlatformConfigFile } from './platform-config-store'
import type { PlatformConfigV2 } from './platform-config'
import { ChatArchiveManager } from './chat-archive'

const SETTINGS_FILE = 'settings.json'
const F1_DB_PATH = process.env.F1_DB_PATH || '../F1GStats/f1gstats.sqlite'
const F1_TEMPLATES_FILE = 'f1-text-templates.json'
const EXAMPLE_SETTINGS_FILE = 'settings.example.json'
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
const chatHub = new ChatHub({
  notif: chatNotifQueue,
  onChat: (event: ChatEvent) => {
    chatArchive.appendChat(event)
  },
})

interface Settings {
  tiktokUsername: string
  runningText: string
}

type PlatformType = 'tiktok' | 'youtube'

interface PlatformConnectorConfig {
  enabled: boolean
  platform: PlatformType
  /** TikTok: channel username e.g. "@creator". YouTube: not used for connect (use videoId or channelId). */
  tiktokUsername?: string
  /** YouTube: specific live video ID. If empty, the connector will search for the live broadcast of the channel. */
  youtubeVideoId?: string
  /** YouTube: channel ID (UCxxxxxx) used to find current live broadcast when youtubeVideoId is empty. */
  youtubeChannelId?: string
  /** YouTube Data API v3 key. Required for YouTube connector. */
  youtubeApiKey?: string
  /** Poll interval in ms. Min 10s, max 300s. Default 30s. */
  pollIntervalMs?: number
  chatDisplayDurationMs?: number
}

interface PlatformConnectorStatus {
  enabled: boolean
  platform: PlatformType
  running: boolean
  lastFetchedAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
}

interface GradientStyle {
  enabled?: boolean
  from?: string
  to?: string
  angle?: number
}

interface ElementStyle {
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  color?: string
  textAlign?: 'left' | 'center' | 'right'
  verticalAlign?: 'top' | 'center' | 'bottom'
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  letterSpacing?: number
  lineHeight?: number
  textShadow?: string
  backgroundColor?: string
  gradient?: GradientStyle
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none'
  padding?: number
  shadowColor?: string
  shadowBlur?: number
  shadowOffsetX?: number
  shadowOffsetY?: number
}

/**
 * Properti elemen yang bisa jadi target animasi. Sengaja dibatasi (bukan semua
 * CSS property) — lihat Vision.md §3.3.1 dan public/animation-engine.js.
 */
interface AnimatableProperties {
  x?: number
  y?: number
  opacity?: number
  scale?: number
  rotation?: number
  rotationX?: number
  rotationY?: number
  perspective?: number
}

/**
 * Satu step animasi dalam sequence (Q0, Q1, Q2, ...). Dieksekusi berurutan.
 *   - 'to': animasi dari state elemen saat ini menuju `properties`.
 *   - 'from': animasi dari `properties` menuju state elemen saat ini (state akhir
 *     tidak berubah secara kanonis — dipakai untuk efek entrance seperti fadeIn/slideUp
 *     tanpa mengubah x/y/opacity tersimpan elemen, supaya WYSIWYG di editor tetap akurat).
 *   - 'fromTo': kedua state (`from` & `to`) dispesifikasikan eksplisit.
 */
interface AnimationStep {
  id?: string
  /** 'delay' adalah step khusus: cuma menunggu, tanpa animasi properti apapun
   *  (lihat `duration`). Dibuat sebagai step tersendiri (bukan field nempel di
   *  tiap step) supaya bisa disisipkan/dipindah/diduplikat bebas di posisi
   *  manapun dalam sequence. */
  type: 'to' | 'from' | 'fromTo' | 'delay'
  properties?: AnimatableProperties
  from?: AnimatableProperties
  to?: AnimatableProperties
  duration: number
  /** @deprecated Field lama, digantikan step 'delay' tersendiri. Masih dibaca oleh
   *  animation-engine.js untuk migrasi otomatis data lama, tapi jangan dipakai lagi
   *  untuk data baru. */
  delay?: number
  ease?: string
  repeat?: number
  yoyo?: boolean
}

interface AnimationConfig {
  enter: {
    sequence: AnimationStep[]
    loop?: boolean
  }
  transition: {
    sequence: TransitionStep[]
  }
}

type StateTarget = Partial<AnimatableProperties>
type TransitionProperty = keyof AnimatableProperties

interface TransitionStep {
  id?: string
  type: 'to' | 'delay'
  properties?: TransitionProperty[]
  duration: number
  ease?: string
}

type PlatformTextBindingField =
  | 'platform'
  | 'username'
  | 'displayName'
  | 'viewerCount'
  | 'followerCount'
  | 'likeCount'
  | 'latestChatAuthor'
  | 'latestChatMessage'
  | 'isLive'

interface PlatformTextBinding {
  enabled?: boolean
  source: 'platform'
  field: PlatformTextBindingField
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** fieldPath examples: "driverStandingsText.abbrMarquee", "constructorStandingsText.fullMultiline",
 *  "startingGridText.marquee", "scheduleText.nowMultiline". */
interface F1TextBinding {
  enabled?: boolean
  source: 'f1data'
  fieldPath?: string
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Infrastruktur Control Panel (fondasi #5/#6) — teks yang dibind ke sebuah Counter
 *  di control-state.json. `group` = nama grup counter (auto-create kalau belum ada).
 *  (`name` = alias lama, masih dibaca overlay untuk scene lama.) */
interface CounterTextBinding {
  enabled?: boolean
  source: 'counter'
  group: string
  /** @deprecated alias lama untuk `group` */
  name?: string
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Infrastruktur Control Panel (fondasi #5/#6) — teks yang dibind ke sebuah Event State
 *  (enum single-active) di control-state.json. `group` = nama grup event state. */
interface EventStateTextBinding {
  enabled?: boolean
  source: 'eventState'
  group: string
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Infrastruktur Control Panel — teks yang dibind ke sebuah Timer (countdown/count up)
 *  di control-state.json. `group` = nama grup timer. `format`: 'mm:ss' (default,
 *  meluap ke menit kalau >1 jam), 'hh:mm:ss', atau 'seconds' (total detik bulat). */
interface TimerTextBinding {
  enabled?: boolean
  source: 'timer'
  group: string
  format?: 'mm:ss' | 'hh:mm:ss' | 'seconds'
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Teks berbasis jam lokal. `format`: token dddd, ddd, YYYY, YY, MMMM, MMM, MM, M,
 *  DD, D, HH, H, hh, h, mm, m, ss, s, A, atau a. Default timezone `Asia/Jakarta`
 *  dan format `HH:mm:ss`. */
interface ClockTextBinding {
  enabled?: boolean
  source: 'clock'
  timezone?: string
  format?: string
  prefix?: string
  suffix?: string
  fallback?: string
}

/** Control Panel — teks bebas (single/multiline) yang ditulis di /control dan bisa di-bind ke
 *  banyak elemen teks sekaligus lewat nama grup yang sama. `group` = nama grup teks. */
interface TextControlBinding {
  enabled?: boolean
  source: 'text'
  group: string
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

type TextBinding = TextControlBinding | PlatformTextBinding | F1TextBinding | CounterTextBinding | EventStateTextBinding | TimerTextBinding | ClockTextBinding

/** Infrastruktur Control Panel (fondasi #5/#6) — kontrol visibility elemen berdasarkan
 *  nilai Counter (dibanding dengan `matchValue` pakai `comparator`) atau Event State (elemen
 *  tampil kalau eventState grup tsb bernilai `matchValue`). Terpisah dari `hidden` (manual toggle
 *  di Editor); kalau keduanya ada, `hidden=true` selalu menang (override manual tetap final).
 */
interface StateBinding {
  enabled?: boolean
  source: 'counter' | 'eventState'
  group: string
  fallbackState?: string
}

interface MarqueeConfig {
  enabled?: boolean
  speed?: number
  gap?: number
  direction?: 'rtl' | 'ltr'
}

interface ScrollConfig {
  enabled?: boolean
  speed?: number
  gap?: number
  direction?: 'up' | 'down'
  yoyo?: boolean
  yoyoDelay?: number
}

interface SceneElement {
  id: string
  type: 'text' | 'shape' | 'badge' | 'image'
  name: string
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  opacity?: number
  scale?: number
  zIndex?: number
  hidden?: boolean
  locked?: boolean
  src?: string
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  style: ElementStyle
  animation?: AnimationConfig
  textBinding?: TextBinding
  stateBinding?: StateBinding
  /** @deprecated Skema lama. Dimigrasi otomatis ke stateBinding/stateTargets saat scene dimuat; hanya tersisa
   *  kalau comparator-nya tidak bisa dipetakan ke state diskret (gt/gte/lt/lte/neq) — dipertahankan agar data tidak hilang. */
  visibilityBinding?: Record<string, unknown>
  stateTargets?: Record<string, StateTarget>
  /** Urutan tampil state di editor (hanya kosmetik; key angka di objek selalu terurut naik). */
  stateOrder?: string[]
  marquee?: MarqueeConfig
  scroll?: ScrollConfig
  /**
   * Fase 9 — Element Binding/Grouping (Parent-Child Transform), lihat Vision.md §3.3.2.
   * Kalau terisi & merujuk ke elemen lain yang valid (bukan diri sendiri, dan parent itu
   * sendiri BUKAN child dari elemen lain — scope sengaja dibatasi 1 level nesting),
   * elemen ini jadi "child": x/y jadi relatif terhadap parent (bukan lagi absolut
   * terhadap kanvas), dan otomatis ikut posisi+animasi parent lewat DOM/container
   * nesting di renderer (index.html/overlay.html). Kalau referensi tidak valid,
   * elemen diperlakukan sebagai top-level (fallback graceful, tidak crash).
   */
  parentId?: string | null
}

interface SceneData {
  id: string
  name: string
  canvas: {
    width: number
    height: number
    backgroundColor?: string
  }
  elements: SceneElement[]
}

interface SceneStoreLoadResult {
  scenes: SceneData[]
  source: 'scenes' | 'legacy' | 'example-scenes' | 'example-scene' | 'default'
  scenesFileExists: boolean
  scenesFileCorrupt: boolean
}

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
let f1DbInitError: string | null = null

function getF1Db(): Database | null {
  if (f1Db) return f1Db
  if (f1DbInitError) return null
  try {
    f1Db = new Database(F1_DB_PATH, { readonly: true })
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

const DEFAULT_SETTINGS: Settings = {
  tiktokUsername: '@creator',
  runningText: 'Welcome to my stream! Jangan lupa follow & share ✨',
}

async function getSettings(): Promise<Settings> {
  const file = Bun.file(SETTINGS_FILE)
  if (await file.exists()) {
    try {
      const text = await file.text()
      return JSON.parse(text)
    } catch {
      // Fallback if parsing fails
    }
  }

  const exampleFile = Bun.file(EXAMPLE_SETTINGS_FILE)
  let initialData = DEFAULT_SETTINGS
  if (await exampleFile.exists()) {
    try {
      initialData = JSON.parse(await exampleFile.text())
    } catch {
      initialData = DEFAULT_SETTINGS
    }
  }

  await Bun.write(SETTINGS_FILE, JSON.stringify(initialData, null, 2))
  return initialData
}

async function saveSettings(data: Partial<Settings>): Promise<Settings> {
  const current = await getSettings()
  const updated: Settings = {
    tiktokUsername: data.tiktokUsername ?? current.tiktokUsername,
    runningText: data.runningText ?? current.runningText,
  }
  await Bun.write(SETTINGS_FILE, JSON.stringify(updated, null, 2))
  return updated
}

function createDefaultScene(id = 'default', name = 'Live Streaming Scene'): SceneData {
  return {
    id,
    name,
    canvas: {
      width: 1920,
      height: 1080,
      backgroundColor: 'transparent',
    },
    elements: [],
  }
}

function normalizeSceneId(value: string, fallback: string): string {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback
}

function normalizeScene(scene: Partial<SceneData>, index = 0): SceneData {
  const safeIndex = index >= 0 ? index : 0
  const fallbackId = safeIndex === 0 ? 'default' : `scene-${safeIndex + 1}`
  const id = normalizeSceneId(scene.id || scene.name || fallbackId, fallbackId)
  const name = String(scene.name || (safeIndex === 0 ? 'Live Streaming Scene' : `Scene ${safeIndex + 1}`)).trim() || `Scene ${safeIndex + 1}`
  const canvas = scene.canvas || {} as Partial<SceneData['canvas']>
  const elements = Array.isArray(scene.elements) ? scene.elements : []

  return {
    ...(scene as SceneData),
    id,
    name,
    canvas: {
      width: Number(canvas.width) || 1920,
      height: Number(canvas.height) || 1080,
      backgroundColor: canvas.backgroundColor || 'transparent',
    },
    elements: (elements as SceneElement[]).map(migrateLegacyElement),
  }
}

async function readSceneStore(): Promise<SceneStoreLoadResult> {
  const scenesFile = Bun.file(SCENES_FILE)
  if (await scenesFile.exists()) {
    try {
      const parsed = JSON.parse(await scenesFile.text())
      if (Array.isArray(parsed)) {
        return {
          scenes: parsed.map((scene, index) => normalizeScene(scene, index)),
          source: 'scenes',
          scenesFileExists: true,
          scenesFileCorrupt: false,
        }
      }
    } catch {
      return { scenes: [createDefaultScene()], source: 'default', scenesFileExists: true, scenesFileCorrupt: true }
    }
  }
  return {
    scenes: [createDefaultScene()],
    source: 'default',
    scenesFileExists: false,
    scenesFileCorrupt: false,
  }
}

async function persistSceneStore(scenes: SceneData[]): Promise<SceneData[]> {
  const normalized = scenes.length > 0
    ? scenes.map((scene, index) => normalizeScene(scene, index))
    : [createDefaultScene()]

  await Bun.write(SCENES_FILE, JSON.stringify(normalized, null, 2))
  return normalized
}

async function getScenes(): Promise<SceneData[]> {
  const result = await readSceneStore()
  if (!result.scenesFileExists) {
    await persistSceneStore(result.scenes)
  }
  return result.scenes
}

async function getSceneById(sceneId?: string): Promise<SceneData | null> {
  const scenes = await getScenes()
  if (!sceneId) return scenes[0] || createDefaultScene()
  const normalizedId = normalizeSceneId(sceneId, scenes[0]?.id || 'default')
  return scenes.find((scene) => scene.id === normalizedId) || null
}

async function saveScene(scene: SceneData, originalId?: string): Promise<SceneData> {
  const store = await readSceneStore()
  if (store.scenesFileCorrupt) {
    throw { message: `Cannot save scene while ${SCENES_FILE} is corrupt. Repair or remove the file first.`, status: 409 }
  }

  const scenes = store.scenes
  const normalizedOriginalId = originalId ? normalizeSceneId(originalId, '') : ''
  const normalized = normalizeScene(scene, scenes.findIndex((item) => item.id === normalizedOriginalId || item.id === scene.id))
  const conflictingScene = scenes.find((item) => item.id === normalized.id && item.id !== normalizedOriginalId)

  if (conflictingScene) {
    throw { message: `Scene ID "${normalized.id}" already exists. Use a different identifier.`, status: 409 }
  }

  const targetId = normalizedOriginalId || normalized.id
  const nextScenes = scenes.some((item) => item.id === targetId)
    ? scenes.map((item) => (item.id === targetId ? normalized : item))
    : [...scenes, normalized]
  await persistSceneStore(nextScenes)
  return normalized
}

async function deleteScene(sceneId: string): Promise<SceneData[]> {
  const store = await readSceneStore()
  if (store.scenesFileCorrupt) {
    throw { message: `Cannot delete scene while ${SCENES_FILE} is corrupt. Repair or remove the file first.`, status: 409 }
  }

  const scenes = store.scenes
  const normalizedId = normalizeSceneId(sceneId, '')
  if (!normalizedId) {
    throw { message: 'Scene identifier is required', status: 400 }
  }

  const nextScenes = scenes.filter((scene) => scene.id !== normalizedId)
  return await persistSceneStore(nextScenes.length > 0 ? nextScenes : [createDefaultScene()])
}

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
      await Bun.write(LIVE_STATS_FILE, JSON.stringify(initialStats, null, 2))
      liveStatsMemoryCache = initialStats
      return initialStats
    } catch {
      // Fallback
    }
  }

  await Bun.write(LIVE_STATS_FILE, JSON.stringify(DEFAULT_LIVE_STATS, null, 2))
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
          await Bun.write(LIVE_STATS_FILE, JSON.stringify(liveStatsMemoryCache, null, 2))
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
  save: async (state) => { await Bun.write(CONTROL_STATE_FILE, JSON.stringify(state, null, 2)) },
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
  },
})

async function savePlatformConfig(data: Partial<PlatformConnectorConfig>): Promise<PlatformConnectorConfig> {
  const current = await loadPlatformConfigFile(PLATFORM_CONFIG_FILE)
  const legacyCurrent = toLegacyPlatformConfig(current)
  const platform = data.platform === 'youtube' ? 'youtube' : data.platform === 'tiktok' ? 'tiktok' : null
  await savePlatformConfigFile(PLATFORM_CONFIG_FILE, {
    tiktok: {
      ...(data.tiktokUsername !== undefined ? { username: data.tiktokUsername } : {}),
      ...(data.enabled !== undefined && platform === 'tiktok' ? { enabled: data.enabled } : {}),
    },
    youtube: {
      ...(data.youtubeApiKey !== undefined ? { apiKey: data.youtubeApiKey } : {}),
      ...(data.youtubeVideoId !== undefined ? { videoId: data.youtubeVideoId } : {}),
      ...(data.youtubeChannelId !== undefined ? { channelId: data.youtubeChannelId } : {}),
      ...(data.enabled !== undefined && platform === 'youtube' ? { enabled: data.enabled } : {}),
    },
    stats: data.pollIntervalMs !== undefined ? { pollIntervalMs: data.pollIntervalMs } : {},
    notif: data.chatDisplayDurationMs !== undefined ? { displayMs: data.chatDisplayDurationMs } : {},
  })
  // Legacy start/stop omitted `platform`; retain the previously selected platform.
  if (data.enabled !== undefined && !platform) {
    await savePlatformConfigFile(PLATFORM_CONFIG_FILE, legacyCurrent.platform === 'tiktok'
      ? { tiktok: { enabled: data.enabled } }
      : { youtube: { enabled: data.enabled } })
  }
  return toLegacyPlatformConfig(await loadPlatformConfigFile(PLATFORM_CONFIG_FILE))
}

function toLegacyPlatformConfig(config: PlatformConfigV2): PlatformConnectorConfig {
  // The old editor can still drive one connector until its two-toggle UI lands.
  const platform: PlatformType = config.tiktok.enabled || !config.youtube.enabled ? 'tiktok' : 'youtube'
  return {
    enabled: platform === 'tiktok' ? config.tiktok.enabled : config.youtube.enabled,
    platform,
    tiktokUsername: config.tiktok.username,
    youtubeVideoId: config.youtube.videoId,
    youtubeChannelId: config.youtube.channelId,
    youtubeApiKey: config.youtube.apiKey,
    pollIntervalMs: config.stats.pollIntervalMs,
    chatDisplayDurationMs: config.notif.displayMs,
  }
}

function currentPlatformStatus(platform: PlatformType): PlatformStatus {
  return connectorManager.getPlatformStatus(platform)
}

function legacyConnectorStatus(config: PlatformConfigV2): PlatformConnectorStatus {
  const legacy = toLegacyPlatformConfig(config)
  const st = connectorManager.getPlatformStatus(legacy.platform)
  return {
    platform: legacy.platform,
    enabled: st.enabled,
    running: st.running,
    lastError: st.lastError,
    lastSuccessAt: st.lastSuccessAt,
    lastFetchedAt: st.lastSuccessAt,
  }
}

function schedulePlatformConnectors(config: PlatformConfigV2): void {
  chatNotifQueue.configure(config.notif)
  const anyEnabled = config.tiktok.enabled || config.youtube.enabled
  if (anyEnabled && config.archive.enabled && !chatArchive.getActiveSessionId()) {
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

const app = new Elysia()
  .onBeforeHandle(({ request, headers, set }) => {
    if (!SETTINGS_SECRET || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) return

    const authHeader = headers['authorization'] || headers['x-secret-token']
    const token = authHeader?.replace(/^Bearer\s+/i, '')
    if (token !== SETTINGS_SECRET) {
      set.status = 401
      return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
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
  // ─── Chat Archive Endpoints ───────────────────────────────────────────────
  .get('/api/chat/archive', async ({ headers, set }) => {
    if (SETTINGS_SECRET) {
      const token = (headers['authorization'] || headers['x-secret-token'])?.replace(/^Bearer\s+/i, '')
      if (token !== SETTINGS_SECRET) { set.status = 401; return { success: false, message: 'Unauthorized' } }
    }
    return { sessions: await chatArchive.listSessions() }
  })
  .post('/api/chat/archive/session/end', async ({ headers, set }) => {
    if (SETTINGS_SECRET) {
      const token = (headers['authorization'] || headers['x-secret-token'])?.replace(/^Bearer\s+/i, '')
      if (token !== SETTINGS_SECRET) { set.status = 401; return { success: false, message: 'Unauthorized' } }
    }
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
    const config = toLegacyPlatformConfig(configV2)
    return {
      config,
      configV2,
      status: legacyConnectorStatus(configV2),
      statusV2: { tiktok: currentPlatformStatus('tiktok'), youtube: currentPlatformStatus('youtube') },
    }
  })
  .post(
    '/api/platform-connector',
    async ({ body, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

      const rawBody = body as any
      const hasV2Patch = rawBody.tiktok || rawBody.youtube || rawBody.stats || rawBody.notif || rawBody.chatFormat || rawBody.archive
      const configV2 = hasV2Patch
        ? await savePlatformConfigFile(PLATFORM_CONFIG_FILE, rawBody)
        : await (async () => {
            await savePlatformConfig({
              enabled: body.enabled ?? undefined,
              platform: (body.platform as PlatformType) ?? undefined,
              tiktokUsername: body.tiktokUsername ?? undefined,
              youtubeVideoId: body.youtubeVideoId ?? undefined,
              youtubeChannelId: body.youtubeChannelId ?? undefined,
              youtubeApiKey: body.youtubeApiKey ?? undefined,
              pollIntervalMs: body.pollIntervalMs ?? undefined,
              chatDisplayDurationMs: body.chatDisplayDurationMs ?? undefined,
            })
            return loadPlatformConfigFile(PLATFORM_CONFIG_FILE)
          })()
      schedulePlatformConnectors(configV2)

      return {
        success: true,
        message: 'Platform connector config saved',
        config: toLegacyPlatformConfig(configV2),
        status: {
          ...legacyConnectorStatus(configV2),
        },
        configV2,
      }
    },
    {
      body: t.Object({
        enabled: t.Optional(t.Boolean()),
        platform: t.Optional(t.String()),
        tiktokUsername: t.Optional(t.String()),
        youtubeVideoId: t.Optional(t.String()),
        youtubeChannelId: t.Optional(t.String()),
        youtubeApiKey: t.Optional(t.String()),
        pollIntervalMs: t.Optional(t.Numeric()),
        chatDisplayDurationMs: t.Optional(t.Numeric()),
        tiktok: t.Optional(t.Any()),
        youtube: t.Optional(t.Any()),
        stats: t.Optional(t.Any()),
        notif: t.Optional(t.Any()),
        chatFormat: t.Optional(t.Any()),
        archive: t.Optional(t.Any()),
      }),
    }
  )
  .post(
    '/api/platform-connector/start',
    async ({ body, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

      const targetPlatform = (body as any)?.platform as PlatformType | undefined
      let configV2: PlatformConfigV2
      if (targetPlatform === 'tiktok') {
        configV2 = await savePlatformConfigFile(PLATFORM_CONFIG_FILE, { tiktok: { enabled: true } })
        connectorManager.startPlatform('tiktok', configV2)
      } else if (targetPlatform === 'youtube') {
        configV2 = await savePlatformConfigFile(PLATFORM_CONFIG_FILE, { youtube: { enabled: true } })
        connectorManager.startPlatform('youtube', configV2)
      } else {
        await savePlatformConfig({ enabled: true })
        configV2 = await loadPlatformConfigFile(PLATFORM_CONFIG_FILE)
        schedulePlatformConnectors(configV2)
      }

      const legacyConfig = toLegacyPlatformConfig(configV2)
      return {
        success: true,
        message: `Platform connector started (${targetPlatform || legacyConfig.platform})`,
        status: legacyConnectorStatus(configV2),
        statusV2: connectorManager.getStatus(),
      }
    },
    {
      body: t.Optional(
        t.Object({
          platform: t.Optional(t.String()),
        })
      ),
    }
  )
  .post(
    '/api/platform-connector/stop',
    async ({ body, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

      const targetPlatform = (body as any)?.platform as PlatformType | undefined
      let configV2: PlatformConfigV2
      if (targetPlatform === 'tiktok') {
        configV2 = await savePlatformConfigFile(PLATFORM_CONFIG_FILE, { tiktok: { enabled: false } })
        connectorManager.stopPlatform('tiktok')
      } else if (targetPlatform === 'youtube') {
        configV2 = await savePlatformConfigFile(PLATFORM_CONFIG_FILE, { youtube: { enabled: false } })
        connectorManager.stopPlatform('youtube')
      } else {
        await savePlatformConfig({ enabled: false })
        configV2 = await loadPlatformConfigFile(PLATFORM_CONFIG_FILE)
        schedulePlatformConnectors(configV2)
      }

      return {
        success: true,
        message: `Platform connector stopped (${targetPlatform || 'all'})`,
        status: legacyConnectorStatus(configV2),
        statusV2: connectorManager.getStatus(),
      }
    },
    {
      body: t.Optional(
        t.Object({
          platform: t.Optional(t.String()),
        })
      ),
    }
  )

  .get('/api/scenes', async () => {
    const scenes = await getScenes()
    return {
      scenes,
      activeSceneId: scenes[0]?.id || null,
      activeScene: scenes[0] || createDefaultScene(),
    }
  })
  .get('/api/scenes/:id', async ({ params, set }) => {
    const scene = await getSceneById(params.id)
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
    async ({ request, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

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
    async ({ params, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

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
    async ({ body, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

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
    async ({ body, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

      try {
        const payload = body as { scene?: SceneData; originalId?: string }
        const updated = await saveScene((payload.scene || body) as SceneData, payload.originalId)
        return {
          success: true,
          message: 'Scene saved successfully',
          data: updated,
        }
      } catch (error: any) {
        set.status = error?.status || 500
        return { success: false, message: error?.message || 'Failed to save scene' }
      }
    }
  )
  .delete(
    '/api/scenes/:id',
    async ({ params, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

      try {
        const scenes = await deleteScene(params.id)
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
