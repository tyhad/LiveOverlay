import { Elysia, t } from 'elysia'
import { staticPlugin } from '@elysiajs/static'
import { mkdir, readdir } from 'node:fs/promises'

const SETTINGS_FILE = 'settings.json'
const EXAMPLE_SETTINGS_FILE = 'settings.example.json'
const SCENE_FILE = 'scene.json'
const EXAMPLE_SCENE_FILE = 'scene.example.json'
const SCENES_FILE = 'scenes.json'
const EXAMPLE_SCENES_FILE = 'scenes.example.json'
const LIVE_STATS_FILE = 'live-stats.json'
const EXAMPLE_LIVE_STATS_FILE = 'live-stats.example.json'
const DATA_SOURCES_FILE = 'data-sources.json'
const EXAMPLE_DATA_SOURCES_FILE = 'data-sources.example.json'
const ASSET_DIRECTORY = 'public/uploads'
const SETTINGS_SECRET = process.env.SETTINGS_SECRET
const PORT = Number(process.env.PORT || 3000)
const MAX_ASSET_SIZE = 10 * 1024 * 1024
const DEFAULT_EXTERNAL_POLL_INTERVAL_MS = 15_000
const DEFAULT_EXTERNAL_TIMEOUT_MS = 5_000
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
  const canvas = scene.canvas || {}
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

async function readSceneStore(): Promise<SceneData[]> {
  const scenesFile = Bun.file(SCENES_FILE)
  if (await scenesFile.exists()) {
    try {
      const parsed = JSON.parse(await scenesFile.text())
      if (Array.isArray(parsed)) {
        return parsed.map((scene, index) => normalizeScene(scene, index))
      }
    } catch {
      // Fall back to legacy files
    }
  }

  const legacyFile = Bun.file(SCENE_FILE)
  if (await legacyFile.exists()) {
    try {
      const parsed = JSON.parse(await legacyFile.text())
      if (parsed && typeof parsed === 'object') {
        return [normalizeScene(parsed as Partial<SceneData>, 0)]
      }
    } catch {
      // Fall back to example files
    }
  }

  const exampleScenesFile = Bun.file(EXAMPLE_SCENES_FILE)
  if (await exampleScenesFile.exists()) {
    try {
      const parsed = JSON.parse(await exampleScenesFile.text())
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((scene, index) => normalizeScene(scene, index))
      }
    } catch {
      // Fall back to legacy example file
    }
  }

  const exampleSceneFile = Bun.file(EXAMPLE_SCENE_FILE)
  if (await exampleSceneFile.exists()) {
    try {
      const parsed = JSON.parse(await exampleSceneFile.text())
      if (parsed && typeof parsed === 'object') {
        return [normalizeScene(parsed as Partial<SceneData>, 0)]
      }
    } catch {
      // Use built-in fallback
    }
  }

  return [createDefaultScene()]
}

async function persistSceneStore(scenes: SceneData[]): Promise<SceneData[]> {
  const normalized = scenes.length > 0
    ? scenes.map((scene, index) => normalizeScene(scene, index))
    : [createDefaultScene()]

  await Bun.write(SCENES_FILE, JSON.stringify(normalized, null, 2))
  await Bun.write(SCENE_FILE, JSON.stringify(normalized[0], null, 2))
  return normalized
}

async function getScenes(): Promise<SceneData[]> {
  const scenes = await readSceneStore()
  if (scenes.length === 0) {
    return await persistSceneStore([createDefaultScene()])
  }
  if (!(await Bun.file(SCENES_FILE).exists())) {
    await persistSceneStore(scenes)
  } else if (!(await Bun.file(SCENE_FILE).exists())) {
    await Bun.write(SCENE_FILE, JSON.stringify(scenes[0], null, 2))
  }
  return scenes
}

async function getSceneById(sceneId?: string): Promise<SceneData> {
  const scenes = await getScenes()
  const normalizedId = sceneId ? normalizeSceneId(sceneId, scenes[0]?.id || 'default') : ''
  const matched = normalizedId ? scenes.find((scene) => scene.id === normalizedId) : undefined
  return matched || scenes[0] || createDefaultScene()
}

async function saveScene(scene: SceneData): Promise<SceneData> {
  const scenes = await getScenes()
  const normalized = normalizeScene(scene, scenes.findIndex((item) => item.id === scene.id))
  const nextScenes = scenes.some((item) => item.id === normalized.id)
    ? scenes.map((item) => (item.id === normalized.id ? normalized : item))
    : [...scenes, normalized]
  await persistSceneStore(nextScenes)
  return normalized
}

async function deleteScene(sceneId: string): Promise<SceneData[]> {
  const scenes = await getScenes()
  const normalizedId = normalizeSceneId(sceneId, '')
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

const DEFAULT_EXTERNAL_DATA_SOURCES: ExternalDataSourceConfig[] = [
  {
    id: 'weather-jakarta',
    name: 'Open-Meteo Jakarta',
    url: 'https://api.open-meteo.com/v1/forecast?latitude=-6.2&longitude=106.8&current=temperature_2m,weather_code',
    enabled: false,
    method: 'GET',
    pollIntervalMs: 30000,
    timeoutMs: 5000,
    rootPath: 'current',
  },
]

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

function pathSegments(path: string): string[] {
  return String(path || '').match(/[^.[\]]+/g) || []
}

function getValueAtPath(data: unknown, path?: string): unknown {
  if (!path) return data
  return pathSegments(path).reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined
    if (Array.isArray(current)) {
      const index = Number(segment)
      return Number.isInteger(index) ? current[index] : undefined
    }
    if (typeof current === 'object') {
      return (current as Record<string, unknown>)[segment]
    }
    return undefined
  }, data)
}

function collectFieldPaths(data: unknown, prefix = ''): string[] {
  if (data === null || data === undefined) return []
  if (Array.isArray(data)) {
    return data.flatMap((value, index) => collectFieldPaths(value, prefix ? `${prefix}.${index}` : String(index)))
  }
  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>)
    if (entries.length === 0 && prefix) return [prefix]
    return entries.flatMap(([key, value]) => collectFieldPaths(value, prefix ? `${prefix}.${key}` : key))
  }
  return prefix ? [prefix] : []
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

const app = new Elysia()
  .get('/', () => Bun.file('public/index.html'))
  .get('/gui.html', ({ set }) => {
    set.redirect = '/'
  })
  .get('/api/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'LiveOverlay Studio Backend Ready',
  }))
  .get('/api/settings', async () => {
    return await getSettings()
  })
  .post(
    '/api/settings',
    async ({ body, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

      const updated = await saveSettings({
        tiktokUsername: body.tiktokUsername,
        runningText: body.runningText,
      })

      return {
        success: true,
        message: 'Settings saved successfully',
        data: updated,
      }
    },
    {
      body: t.Object({
        tiktokUsername: t.Optional(t.String()),
        runningText: t.Optional(t.String()),
      }),
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
  .get('/api/scene', async ({ query }) => {
    const sceneId = query.scene || query.id
    return await getSceneById(sceneId)
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
    '/api/scene',
    async ({ body, headers, set }) => {
      if (SETTINGS_SECRET) {
        const authHeader = headers['authorization'] || headers['x-secret-token']
        const token = authHeader?.replace(/^Bearer\s+/i, '')
        if (token !== SETTINGS_SECRET) {
          set.status = 401
          return { success: false, message: 'Unauthorized: Invalid or missing secret token' }
        }
      }

      const updated = await saveScene(body as SceneData)
      return {
        success: true,
        message: 'Scene saved successfully',
        data: updated,
      }
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

      const payload = body as { scene?: SceneData }
      const updated = await saveScene((payload.scene || body) as SceneData)
      return {
        success: true,
        message: 'Scene saved successfully',
        data: updated,
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

      const scenes = await deleteScene(params.id)
      return {
        success: true,
        message: 'Scene deleted successfully',
        data: scenes,
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
