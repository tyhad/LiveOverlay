import { Elysia, t } from 'elysia'
import { staticPlugin } from '@elysiajs/static'

const SETTINGS_FILE = 'settings.json'
const EXAMPLE_SETTINGS_FILE = 'settings.example.json'
const SCENE_FILE = 'scene.json'
const EXAMPLE_SCENE_FILE = 'scene.example.json'
const SETTINGS_SECRET = process.env.SETTINGS_SECRET

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
  style: ElementStyle
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

async function getScene(): Promise<SceneData> {
  const file = Bun.file(SCENE_FILE)
  if (await file.exists()) {
    try {
      const text = await file.text()
      return JSON.parse(text)
    } catch {
      // Fallback if parsing fails
    }
  }

  const exampleFile = Bun.file(EXAMPLE_SCENE_FILE)
  if (await exampleFile.exists()) {
    try {
      const initialScene: SceneData = JSON.parse(await exampleFile.text())
      await Bun.write(SCENE_FILE, JSON.stringify(initialScene, null, 2))
      return initialScene
    } catch {
      // Fallback
    }
  }

  const fallbackScene: SceneData = {
    id: 'default',
    name: 'Live Streaming Scene',
    canvas: {
      width: 1920,
      height: 1080,
      backgroundColor: 'transparent',
    },
    elements: [],
  }

  await Bun.write(SCENE_FILE, JSON.stringify(fallbackScene, null, 2))
  return fallbackScene
}

async function saveScene(scene: SceneData): Promise<SceneData> {
  await Bun.write(SCENE_FILE, JSON.stringify(scene, null, 2))
  return scene
}

const app = new Elysia()
  .use(
    staticPlugin({
      assets: 'public',
      prefix: '',
    })
  )
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
  .get('/api/scene', async () => {
    return await getScene()
  })
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
  .listen({
    port: 3000,
    hostname: '127.0.0.1',
  })

console.log(`🦊 LiveOverlay Studio running at http://${app.server?.hostname}:${app.server?.port}`)
