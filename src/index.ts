import { Elysia, t } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { mkdir, readdir, unlink } from 'node:fs/promises'
import { basename } from 'node:path'
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector'

const SETTINGS_FILE = 'settings.json'
const EXAMPLE_SETTINGS_FILE = 'settings.example.json'
const SCENES_FILE = 'scenes.json'
const LIVE_STATS_FILE = 'live-stats.json'
const EXAMPLE_LIVE_STATS_FILE = 'live-stats.example.json'
const DATA_SOURCES_FILE = 'data-sources.json'
const EXAMPLE_DATA_SOURCES_FILE = 'data-sources.example.json'
const PLATFORM_CONFIG_FILE = 'platform-config.json'
const ASSET_DIRECTORY = 'public/uploads'
const SETTINGS_SECRET = process.env.SETTINGS_SECRET
const PORT = Number(process.env.PORT || 3000)
const MAX_ASSET_SIZE = 10 * 1024 * 1024
const DEFAULT_EXTERNAL_POLL_INTERVAL_MS = 15_000
const DEFAULT_EXTERNAL_TIMEOUT_MS = 5_000
const DEFAULT_PLATFORM_POLL_INTERVAL_MS = 30_000
const ASSET_MIME_TYPES = new Map([
  ['image/svg+xml', 'svg'],
  ['image/png', 'png'],
  ['image/jpeg', 'jpg'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
])

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

interface EntranceAnimation {
  type?: 'none' | 'fadeIn' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'zoomIn' | 'bounceIn' | 'flipX' | 'flipY' | 'elasticIn'
  duration?: number
  delay?: number
  ease?: string
}

interface ExitAnimation {
  type?: 'none' | 'fadeOut' | 'slideUp' | 'slideDown' | 'slideLeft' | 'slideRight' | 'zoomOut' | 'bounceOut' | 'flipX'
  duration?: number
  delay?: number
  ease?: string
}

interface LoopAnimation {
  type?: 'none' | 'pulse' | 'float' | 'shake' | 'glow' | 'bounce' | 'spin' | 'swing' | 'heartbeat'
  duration?: number
  intensity?: number
  ease?: string
}

interface AnimationConfig {
  entrance?: EntranceAnimation
  exit?: ExitAnimation
  loop?: LoopAnimation
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

interface ExternalTextBinding {
  enabled?: boolean
  source: 'external'
  externalSourceId?: string
  fieldPath?: string
  format?: 'raw' | 'number' | 'uppercase' | 'lowercase'
  prefix?: string
  suffix?: string
  fallback?: string
}

type TextBinding = PlatformTextBinding | ExternalTextBinding

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
  zIndex?: number
  hidden?: boolean
  locked?: boolean
  src?: string
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down'
  style: ElementStyle
  animation?: AnimationConfig
  textBinding?: TextBinding
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

interface ExternalDataSourceConfig {
  id: string
  name: string
  url: string
  enabled?: boolean
  method?: 'GET'
  headers?: Record<string, string>
  pollIntervalMs?: number
  timeoutMs?: number
  rootPath?: string
}

interface ExternalDataSourceCacheEntry {
  id: string
  name: string
  status: 'idle' | 'success' | 'error' | 'disabled'
  pollIntervalMs: number
  lastFetchedAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  fieldPaths: string[]
  data: unknown
}

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

interface SceneStoreError {
  message: string
  status: number
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
    elements: elements as SceneElement[],
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

async function getLiveStats(): Promise<LiveStatsData> {
  const file = Bun.file(LIVE_STATS_FILE)
  if (await file.exists()) {
    try {
      const text = await file.text()
      return normalizeLiveStats(JSON.parse(text))
    } catch {
      // Fallback if parsing fails
    }
  }

  const exampleFile = Bun.file(EXAMPLE_LIVE_STATS_FILE)
  if (await exampleFile.exists()) {
    try {
      const initialStats = normalizeLiveStats(JSON.parse(await exampleFile.text()))
      await Bun.write(LIVE_STATS_FILE, JSON.stringify(initialStats, null, 2))
      return initialStats
    } catch {
      // Fallback
    }
  }

  await Bun.write(LIVE_STATS_FILE, JSON.stringify(DEFAULT_LIVE_STATS, null, 2))
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

  await Bun.write(LIVE_STATS_FILE, JSON.stringify(updated, null, 2))
  return updated
}

const DEFAULT_EXTERNAL_DATA_SOURCES: ExternalDataSourceConfig[] = []

const externalDataCache = new Map<string, ExternalDataSourceCacheEntry>()
const externalDataInflight = new Map<string, Promise<ExternalDataSourceCacheEntry>>()

function normalizeExternalDataSourceConfig(source: Partial<ExternalDataSourceConfig>, index: number): ExternalDataSourceConfig {
  const safeId = String(source.id || `source_${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || `source_${index + 1}`

  return {
    id: safeId,
    name: String(source.name || `External Source ${index + 1}`).trim() || `External Source ${index + 1}`,
    url: String(source.url || '').trim(),
    enabled: source.enabled !== false,
    method: 'GET',
    headers: source.headers && typeof source.headers === 'object'
      ? Object.fromEntries(
        Object.entries(source.headers)
          .filter(([key, value]) => key && value !== undefined && value !== null)
          .map(([key, value]) => [String(key).trim(), String(value)])
      )
      : {},
    pollIntervalMs: Math.max(5_000, Math.min(300_000, Number(source.pollIntervalMs) || DEFAULT_EXTERNAL_POLL_INTERVAL_MS)),
    timeoutMs: Math.max(1_000, Math.min(30_000, Number(source.timeoutMs) || DEFAULT_EXTERNAL_TIMEOUT_MS)),
    rootPath: String(source.rootPath || '').trim(),
  }
}

async function getExternalDataSources(): Promise<ExternalDataSourceConfig[]> {
  const file = Bun.file(DATA_SOURCES_FILE)
  if (await file.exists()) {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) {
        return parsed.map((source, index) => normalizeExternalDataSourceConfig(source, index))
      }
    } catch {
      // Fallback if parsing fails
    }
  }

  const exampleFile = Bun.file(EXAMPLE_DATA_SOURCES_FILE)
  let initialData = DEFAULT_EXTERNAL_DATA_SOURCES
  if (await exampleFile.exists()) {
    try {
      const parsed = JSON.parse(await exampleFile.text())
      if (Array.isArray(parsed)) {
        initialData = parsed.map((source, index) => normalizeExternalDataSourceConfig(source, index))
      }
    } catch {
      initialData = DEFAULT_EXTERNAL_DATA_SOURCES
    }
  }

  await Bun.write(DATA_SOURCES_FILE, JSON.stringify(initialData, null, 2))
  return initialData
}

async function saveExternalDataSources(data: Partial<ExternalDataSourceConfig>[]): Promise<ExternalDataSourceConfig[]> {
  const normalized = data.map((source, index) => normalizeExternalDataSourceConfig(source, index))
  await Bun.write(DATA_SOURCES_FILE, JSON.stringify(normalized, null, 2))

  const validIds = new Set(normalized.map((source) => source.id))
  for (const id of externalDataCache.keys()) {
    if (!validIds.has(id)) {
      externalDataCache.delete(id)
      externalDataInflight.delete(id)
    }
  }

  return normalized
}

function getValueAtPath(data: unknown, path?: string): unknown {
  if (!path) return data
  return path.split(/[.[\]]+/).filter(Boolean).reduce<unknown>((curr, key) => (curr && typeof curr === 'object' ? (curr as Record<string, unknown>)[key] : undefined), data)
}

function collectFieldPaths(data: unknown, prefix = ''): string[] {
  if (data === null || data === undefined) return []
  if (typeof data !== 'object') return prefix ? [prefix] : []
  return Object.entries(data as Record<string, unknown>).flatMap(([k, v]) => collectFieldPaths(v, prefix ? `${prefix}.${k}` : k))
}

async function refreshExternalDataSource(source: ExternalDataSourceConfig, force = false): Promise<ExternalDataSourceCacheEntry> {
  const current = externalDataCache.get(source.id)
  const now = Date.now()
  const pollIntervalMs = source.pollIntervalMs || DEFAULT_EXTERNAL_POLL_INTERVAL_MS

  if (!source.enabled) {
    const disabledEntry: ExternalDataSourceCacheEntry = {
      id: source.id,
      name: source.name,
      status: 'disabled',
      pollIntervalMs,
      lastFetchedAt: current?.lastFetchedAt || null,
      lastSuccessAt: current?.lastSuccessAt || null,
      lastError: null,
      fieldPaths: current?.fieldPaths || [],
      data: current?.data ?? null,
    }
    externalDataCache.set(source.id, disabledEntry)
    return disabledEntry
  }

  if (!force && current?.status === 'success' && current.lastFetchedAt) {
    const age = now - new Date(current.lastFetchedAt).getTime()
    if (age < pollIntervalMs) return current
  }

  const existingFetch = externalDataInflight.get(source.id)
  if (existingFetch) return existingFetch

  const requestPromise = (async () => {
    const fetchedAt = new Date().toISOString()
    try {
      const response = await fetch(source.url, {
        method: 'GET',
        headers: source.headers,
        signal: AbortSignal.timeout(source.timeoutMs || DEFAULT_EXTERNAL_TIMEOUT_MS),
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`)
      }

      const payload = await response.json()
      const selectedData = source.rootPath ? getValueAtPath(payload, source.rootPath) : payload
      const nextEntry: ExternalDataSourceCacheEntry = {
        id: source.id,
        name: source.name,
        status: 'success',
        pollIntervalMs,
        lastFetchedAt: fetchedAt,
        lastSuccessAt: fetchedAt,
        lastError: null,
        fieldPaths: collectFieldPaths(selectedData),
        data: selectedData ?? null,
      }
      externalDataCache.set(source.id, nextEntry)
      return nextEntry
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown fetch error'
      const failedEntry: ExternalDataSourceCacheEntry = {
        id: source.id,
        name: source.name,
        status: 'error',
        pollIntervalMs,
        lastFetchedAt: fetchedAt,
        lastSuccessAt: current?.lastSuccessAt || null,
        lastError: message,
        fieldPaths: current?.fieldPaths || [],
        data: current?.data ?? null,
      }
      externalDataCache.set(source.id, failedEntry)
      return failedEntry
    } finally {
      externalDataInflight.delete(source.id)
    }
  })()

  externalDataInflight.set(source.id, requestPromise)
  return requestPromise
}

async function getExternalDataSnapshot(force = false) {
  const sources = await getExternalDataSources()
  const entries = await Promise.all(sources.map((source) => refreshExternalDataSource(source, force)))
  return { sources, cache: entries }
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

const DEFAULT_PLATFORM_CONFIG: PlatformConnectorConfig = {
  enabled: false,
  platform: 'tiktok',
  tiktokUsername: '',
  youtubeVideoId: '',
  youtubeChannelId: '',
  youtubeApiKey: '',
  pollIntervalMs: DEFAULT_PLATFORM_POLL_INTERVAL_MS,
}

let platformConnectorStatus: PlatformConnectorStatus = {
  enabled: false,
  platform: 'tiktok',
  running: false,
  lastFetchedAt: null,
  lastSuccessAt: null,
  lastError: null,
}

let platformPollTimer: ReturnType<typeof setTimeout> | null = null
let tiktokConn: TikTokLiveConnection | null = null
let tiktokConnUsername: string = ''
let tiktokBackoffAttempt = 0
let tiktokReconnectTimer: ReturnType<typeof setTimeout> | null = null

let cachedYouTubeVideoId: string | null = null
let cachedYouTubeChannelId: string | null = null
let cachedYouTubeSubCount: number | null = null
let cachedYouTubeSubLastFetched: number = 0
let youtubeBackoffAttempt = 0

async function getPlatformConfig(): Promise<PlatformConnectorConfig> {
  const file = Bun.file(PLATFORM_CONFIG_FILE)
  if (await file.exists()) {
    try {
      const parsed = JSON.parse(await file.text())
      return {
        ...DEFAULT_PLATFORM_CONFIG,
        ...parsed,
        pollIntervalMs: Math.max(10_000, Math.min(300_000, Number(parsed.pollIntervalMs) || DEFAULT_PLATFORM_POLL_INTERVAL_MS)),
      }
    } catch {
      // Fallback to default
    }
  }
  return { ...DEFAULT_PLATFORM_CONFIG }
}

async function savePlatformConfig(data: Partial<PlatformConnectorConfig>): Promise<PlatformConnectorConfig> {
  const current = await getPlatformConfig()
  const updated: PlatformConnectorConfig = {
    ...current,
    ...data,
    pollIntervalMs: Math.max(10_000, Math.min(300_000, Number(data.pollIntervalMs ?? current.pollIntervalMs) || DEFAULT_PLATFORM_POLL_INTERVAL_MS)),
  }
  await Bun.write(PLATFORM_CONFIG_FILE, JSON.stringify(updated, null, 2))
  return updated
}

/** Fetch YouTube channel subscriber count (cached for 5 minutes). */
async function fetchYouTubeSubscriberCount(channelId: string, apiKey: string): Promise<number | undefined> {
  const now = Date.now()
  if (cachedYouTubeSubCount !== null && now - cachedYouTubeSubLastFetched < 300_000) {
    return cachedYouTubeSubCount
  }
  try {
    const url = `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${encodeURIComponent(channelId)}&key=${encodeURIComponent(apiKey)}`
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
    if (res.ok) {
      const data = await res.json() as { items?: { statistics?: { subscriberCount?: string } }[] }
      const subCount = Number(data.items?.[0]?.statistics?.subscriberCount)
      if (Number.isFinite(subCount)) {
        cachedYouTubeSubCount = subCount
        cachedYouTubeSubLastFetched = now
        return subCount
      }
    }
  } catch {
    // Best-effort
  }
  return cachedYouTubeSubCount ?? undefined
}

/** Fetch YouTube live stats via Data API v3 and push to live-stats store. */
async function fetchYouTubeStats(config: PlatformConnectorConfig): Promise<void> {
  const apiKey = config.youtubeApiKey?.trim()
  if (!apiKey) throw new Error('YouTube API key is required')

  let videoId = config.youtubeVideoId?.trim() || ''
  const channelId = config.youtubeChannelId?.trim() || ''

  // If no explicit video ID, resolve & cache video ID for channel to save quota
  if (!videoId) {
    if (!channelId) throw new Error('Either YouTube Video ID or Channel ID is required')

    if (cachedYouTubeChannelId === channelId && cachedYouTubeVideoId) {
      videoId = cachedYouTubeVideoId
    } else {
      // 100 quota units call
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${encodeURIComponent(channelId)}&eventType=live&type=video&key=${encodeURIComponent(apiKey)}`
      const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10_000) })
      if (!searchRes.ok) {
        const errBody = await searchRes.text()
        throw new Error(`YouTube search API ${searchRes.status}: ${errBody.slice(0, 200)}`)
      }
      const searchData = await searchRes.json() as { items?: { id?: { videoId?: string } }[] }
      videoId = searchData.items?.[0]?.id?.videoId || ''
      if (!videoId) {
        cachedYouTubeVideoId = null
        throw new Error('No active live broadcast found for this channel')
      }
      cachedYouTubeVideoId = videoId
      cachedYouTubeChannelId = channelId
    }
  }

  // Fetch video details (1 quota unit)
  const videoUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(apiKey)}`
  const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(10_000) })
  if (!videoRes.ok) {
    cachedYouTubeVideoId = null
    const errBody = await videoRes.text()
    throw new Error(`YouTube videos API ${videoRes.status}: ${errBody.slice(0, 200)}`)
  }

  const videoData = await videoRes.json() as {
    items?: {
      snippet?: { channelTitle?: string; title?: string; channelId?: string }
      liveStreamingDetails?: {
        concurrentViewers?: string
        activeLiveChatId?: string
        actualEndTime?: string
      }
    }[]
  }
  const item = videoData.items?.[0]
  if (!item || item.liveStreamingDetails?.actualEndTime) {
    cachedYouTubeVideoId = null
    throw new Error(`Video ${videoId} is no longer live`)
  }

  const snippet = item.snippet || {}
  const lsd = item.liveStreamingDetails || {}
  const viewerCount = Number(lsd.concurrentViewers) || 0
  const activeChannelId = snippet.channelId || channelId

  // Fetch subscriber count if channel ID available (cached)
  let followerCount: number | undefined = undefined
  if (activeChannelId) {
    followerCount = await fetchYouTubeSubscriberCount(activeChannelId, apiKey)
  }

  // Fetch latest chat messages if liveChatId exists
  let latestChatAuthor = ''
  let latestChatMessage = ''
  const chatMessages: { id: string; author: string; message: string; receivedAt: string }[] = []

  const liveChatId = lsd.activeLiveChatId
  if (liveChatId) {
    try {
      const chatUrl = `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${encodeURIComponent(liveChatId)}&part=snippet,authorDetails&maxResults=25&key=${encodeURIComponent(apiKey)}`
      const chatRes = await fetch(chatUrl, { signal: AbortSignal.timeout(10_000) })
      if (chatRes.ok) {
        const chatData = await chatRes.json() as {
          items?: {
            id?: string
            snippet?: { displayMessage?: string; publishedAt?: string }
            authorDetails?: { displayName?: string }
          }[]
        }
        const items = chatData.items || []
        items.forEach((msg) => {
          const author = msg.authorDetails?.displayName || 'viewer'
          const message = msg.snippet?.displayMessage || ''
          const receivedAt = msg.snippet?.publishedAt || new Date().toISOString()
          chatMessages.push({ id: msg.id || `chat_${Date.now()}`, author, message, receivedAt })
        })
        const last = chatMessages.at(-1)
        if (last) {
          latestChatAuthor = last.author
          latestChatMessage = last.message
        }
      }
    } catch {
      // Best effort
    }
  }

  await saveLiveStats({
    platform: 'YouTube Live',
    username: snippet.channelTitle || activeChannelId || videoId,
    displayName: snippet.channelTitle || snippet.title || videoId,
    viewerCount,
    isLive: true,
    ...(followerCount !== undefined ? { followerCount } : {}),
    latestChatAuthor,
    latestChatMessage,
    chatMessages: chatMessages.length > 0 ? chatMessages : undefined,
  })
}

/** Manage persistent WebSocket connection for TikTok Live using tiktok-live-connector. */
function stopTikTokConnector(): void {
  if (tiktokReconnectTimer) {
    clearTimeout(tiktokReconnectTimer)
    tiktokReconnectTimer = null
  }
  if (tiktokConn) {
    try { tiktokConn.disconnect() } catch {}
    tiktokConn = null
  }
  tiktokConnUsername = ''
  tiktokBackoffAttempt = 0
  platformConnectorStatus.running = false
}

function startTikTokConnector(rawUsername: string): void {
  const username = rawUsername.replace(/^@/, '').trim()
  if (!username) {
    platformConnectorStatus.lastError = 'TikTok username is required'
    return
  }

  // If already connected to the same username and running, do nothing
  if (tiktokConn && tiktokConnUsername === username && platformConnectorStatus.running) {
    return
  }

  // Disconnect existing if changing username or reconnecting
  if (tiktokConn) {
    try { tiktokConn.disconnect() } catch {}
    tiktokConn = null
  }

  tiktokConnUsername = username
  platformConnectorStatus.platform = 'tiktok'
  platformConnectorStatus.enabled = true
  platformConnectorStatus.running = false

  const conn = new TikTokLiveConnection(username, {})
  tiktokConn = conn

  conn.on(WebcastEvent.CHAT, async (data: any) => {
    const author = data.user?.nickname || data.user?.uniqueId || 'viewer'
    const message = data.comment || ''
    await saveLiveStats({
      latestChatAuthor: author,
      latestChatMessage: message,
    })
    platformConnectorStatus.lastSuccessAt = new Date().toISOString()
    platformConnectorStatus.lastError = null
  })

  conn.on(WebcastEvent.ROOM_USER, async (data: any) => {
    if (typeof data.viewerCount === 'number') {
      await saveLiveStats({ viewerCount: data.viewerCount })
    }
  })

  conn.on(WebcastEvent.STREAM_END, async () => {
    await saveLiveStats({ isLive: false })
    platformConnectorStatus.running = false
  })

  conn.on(ControlEvent.DISCONNECTED, () => {
    platformConnectorStatus.running = false
  })

  conn.on(ControlEvent.ERROR, (err: any) => {
    const msg = err instanceof Error ? err.message : String(err)
    platformConnectorStatus.lastError = msg
  })

  conn.connect().then(async (state: any) => {
    platformConnectorStatus.running = true
    platformConnectorStatus.lastSuccessAt = new Date().toISOString()
    platformConnectorStatus.lastError = null
    tiktokBackoffAttempt = 0

    const roomInfo = state?.roomInfo || (conn as any).roomInfo || {}
    const owner = roomInfo?.owner || {}
    const followerCount = owner.follow_info?.follower_count ?? owner.follower_count ?? undefined
    const viewerCount = roomInfo?.user_count?.display_value
      ? Number(String(roomInfo.user_count.display_value).replace(/[^0-9]/g, ''))
      : undefined

    await saveLiveStats({
      platform: 'TikTok Live',
      username: `@${owner.display_id || username}`,
      displayName: owner.nickname || owner.display_id || username,
      isLive: true,
      ...(followerCount !== undefined && Number.isFinite(Number(followerCount)) ? { followerCount: Number(followerCount) } : {}),
      ...(viewerCount !== undefined && Number.isFinite(viewerCount) ? { viewerCount } : {}),
    })
  }).catch((err: any) => {
    platformConnectorStatus.running = false
    const msg = err instanceof Error ? err.message : String(err)
    platformConnectorStatus.lastError = msg

    // Exponential backoff reconnect
    if (tiktokReconnectTimer) clearTimeout(tiktokReconnectTimer)
    tiktokBackoffAttempt++
    const delayMs = Math.min(300_000, 5_000 * Math.pow(2, tiktokBackoffAttempt - 1))
    console.warn(`[tiktok-connector] Connect failed: ${msg}. Retrying in ${delayMs / 1000}s (attempt ${tiktokBackoffAttempt})...`)
    tiktokReconnectTimer = setTimeout(() => {
      startTikTokConnector(username)
    }, delayMs)
  })
}

async function runPlatformConnectorOnce(): Promise<void> {
  const config = await getPlatformConfig()
  if (!config.enabled) {
    stopTikTokConnector()
    if (platformPollTimer) {
      clearTimeout(platformPollTimer)
      platformPollTimer = null
    }
    return
  }

  const now = new Date().toISOString()
  platformConnectorStatus.lastFetchedAt = now

  if (config.platform === 'tiktok') {
    startTikTokConnector(config.tiktokUsername || '')
    return
  }

  // If switching from TikTok to YouTube, stop TikTok connection
  stopTikTokConnector()

  try {
    await fetchYouTubeStats(config)
    platformConnectorStatus.lastSuccessAt = now
    platformConnectorStatus.lastError = null
    platformConnectorStatus.running = true
    youtubeBackoffAttempt = 0
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    platformConnectorStatus.lastError = msg
    youtubeBackoffAttempt++
    console.warn(`[youtube-connector] Error (attempt ${youtubeBackoffAttempt}):`, msg)
  }

  // Reschedule YouTube poll with exponential backoff on failure
  if (platformConnectorStatus.enabled && config.platform === 'youtube') {
    const baseInterval = Math.max(10_000, Math.min(300_000, config.pollIntervalMs || DEFAULT_PLATFORM_POLL_INTERVAL_MS))
    const nextDelay = youtubeBackoffAttempt > 0
      ? Math.min(300_000, baseInterval * Math.pow(2, youtubeBackoffAttempt - 1))
      : baseInterval

    if (platformPollTimer) clearTimeout(platformPollTimer)
    platformPollTimer = setTimeout(() => runPlatformConnectorOnce(), nextDelay)
  }
}

function schedulePlatformPoll(config: PlatformConnectorConfig): void {
  if (platformPollTimer !== null) {
    clearTimeout(platformPollTimer)
    platformPollTimer = null
  }
  if (!config.enabled) {
    stopTikTokConnector()
    platformConnectorStatus.running = false
    return
  }

  if (config.platform === 'tiktok') {
    startTikTokConnector(config.tiktokUsername || '')
  } else {
    stopTikTokConnector()
    runPlatformConnectorOnce()
  }
}

// Initialize platform connector from persisted config on startup
getPlatformConfig().then((config) => {
  platformConnectorStatus.platform = config.platform
  platformConnectorStatus.enabled = config.enabled
  if (config.enabled) {
    schedulePlatformPoll(config)
  }
}).catch((err) => {
  console.warn('[platform-connector] Failed to load config on startup:', err)
})

// ─────────────────────────────────────────────────────────────────────────────

const app = new Elysia()
  .get('/', () => Bun.file('public/index.html'))
  .get('/api/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'LiveOverlay Studio Backend Ready',
  }))
  // NOTE: /api/settings is intentionally removed — it was dead code from the
  // pre-scene-system era. Use /api/live-stats and /api/scenes instead.
  .get('/api/platform-connector', async () => {
    const config = await getPlatformConfig()
    return {
      config,
      status: {
        ...platformConnectorStatus,
        platform: config.platform,
        enabled: config.enabled,
      },
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

      const updated = await savePlatformConfig({
        enabled: body.enabled ?? undefined,
        platform: (body.platform as PlatformType) ?? undefined,
        tiktokUsername: body.tiktokUsername ?? undefined,
        youtubeVideoId: body.youtubeVideoId ?? undefined,
        youtubeChannelId: body.youtubeChannelId ?? undefined,
        youtubeApiKey: body.youtubeApiKey ?? undefined,
        pollIntervalMs: body.pollIntervalMs ?? undefined,
      })

      platformConnectorStatus.platform = updated.platform
      platformConnectorStatus.enabled = updated.enabled

      // Restart the poll cycle with the new config
      schedulePlatformPoll(updated)

      return {
        success: true,
        message: 'Platform connector config saved',
        config: updated,
        status: {
          ...platformConnectorStatus,
          platform: updated.platform,
          enabled: updated.enabled,
        },
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
      }),
    }
  )
  .post('/api/platform-connector/start', async ({ headers, set }) => {
    if (SETTINGS_SECRET) {
      const authHeader = headers['authorization'] || headers['x-secret-token']
      const token = authHeader?.replace(/^Bearer\s+/i, '')
      if (token !== SETTINGS_SECRET) {
        set.status = 401
        return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
      }
    }

    const config = await savePlatformConfig({ enabled: true })
    platformConnectorStatus.platform = config.platform
    platformConnectorStatus.enabled = true
    platformConnectorStatus.lastError = null
    schedulePlatformPoll(config)

    return {
      success: true,
      message: `Platform connector started (${config.platform})`,
      status: { ...platformConnectorStatus },
    }
  })
  .post('/api/platform-connector/stop', async ({ headers, set }) => {
    if (SETTINGS_SECRET) {
      const authHeader = headers['authorization'] || headers['x-secret-token']
      const token = authHeader?.replace(/^Bearer\s+/i, '')
      if (token !== SETTINGS_SECRET) {
        set.status = 401
        return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
      }
    }

    await savePlatformConfig({ enabled: false })
    platformConnectorStatus.enabled = false
    schedulePlatformPoll({ ...DEFAULT_PLATFORM_CONFIG, enabled: false })

    return {
      success: true,
      message: 'Platform connector stopped',
      status: { ...platformConnectorStatus },
    }
  })

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
  .get('/api/assets', async () => {
    return { assets: await listAssets() }
  })
  .get(
    '/api/data-sources',
    async () => {
      return { sources: await getExternalDataSources() }
    }
  )
  .get(
    '/api/external-data',
    async ({ query }) => {
      const forceRefresh = query.refresh === '1' || query.refresh === 'true'
      const snapshot = await getExternalDataSnapshot(forceRefresh)
      return {
        sources: snapshot.cache,
        updatedAt: new Date().toISOString(),
      }
    },
    {
      query: t.Object({
        refresh: t.Optional(t.String()),
      }),
    }
  )
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
  '/api/data-sources',
  async ({ body, headers, set }) => {
    if (SETTINGS_SECRET) {
      const authHeader = headers['authorization'] || headers['x-secret-token']
      const token = authHeader?.replace(/^Bearer\s+/i, '')
      if (token !== SETTINGS_SECRET) {
        set.status = 401
        return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
      }
    }

    const updated = await saveExternalDataSources(body.sources)
    await getExternalDataSnapshot(true)

    return {
      success: true,
      message: 'External data sources saved successfully',
      data: updated,
    }
  },
  {
    body: t.Object({
      sources: t.Array(
        t.Object({
          id: t.Optional(t.String()),
          name: t.Optional(t.String()),
          url: t.Optional(t.String()),
          enabled: t.Optional(t.Boolean()),
          method: t.Optional(t.Literal('GET')),
          headers: t.Optional(t.Record(t.String(), t.String())),
          pollIntervalMs: t.Optional(t.Numeric()),
          timeoutMs: t.Optional(t.Numeric()),
          rootPath: t.Optional(t.String()),
        })
      ),
    }),
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
    })
  )
  .listen({
    port: PORT,
    hostname: '127.0.0.1',
  })

console.log(`🦊 LiveOverlay Studio running at http://${app.server?.hostname}:${app.server?.port}`)
