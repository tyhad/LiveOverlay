import { Elysia, t } from 'elysia'
import { staticPlugin } from '@elysiajs/static'

const SETTINGS_FILE = 'settings.json'
const EXAMPLE_SETTINGS_FILE = 'settings.example.json'
const SETTINGS_SECRET = process.env.SETTINGS_SECRET

interface Settings {
  tiktokUsername: string
  runningText: string
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

  // Check if example file exists to use as template
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
    message: 'LiveOverlay Backend Ready',
  }))
  .get('/api/settings', async () => {
    return await getSettings()
  })
  .post(
    '/api/settings',
    async ({ body, headers, set }) => {
      // If a secret token is configured in the environment, validate it
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
  .listen({
    port: 3000,
    hostname: '127.0.0.1',
  })

console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`)
