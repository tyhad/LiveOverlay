import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'

const app = new Elysia()
  .use(
    staticPlugin({
      assets: 'public',
      prefix: '',
    })
  )
  .get('/', () => Bun.file('public/index.html'))
  .get('/api/health', () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'LiveOverlay Backend Ready',
  }))
  .listen(3000)

console.log(`🦊 Elysia is running at http://${app.server?.hostname}:${app.server?.port}`)
