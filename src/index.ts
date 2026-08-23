import { Elysia, t } from 'elysia'
import { staticPlugin } from '@elysiajs/static'

const SETTINGS_FILE = 'settings.json'

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
  if (!(await file.exists())) {
    await Bun.write(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2))
    return DEFAULT_SETTINGS
  }

  try {
    const text = await file.text()
    return JSON.parse(text)
  } catch {
    await Bun.write(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2))
    return DEFAULT_SETTINGS
  }
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
  .get('/', () => Bun.file('public/gui.html'))
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
    async ({ body }) => {
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
  .listen(3000)

console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`)
