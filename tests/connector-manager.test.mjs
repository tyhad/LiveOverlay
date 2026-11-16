import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ChatHub } from '../src/chat-hub.ts'
import { ConnectorManager } from '../src/connectors/manager.ts'
import { WebcastEvent } from 'tiktok-live-connector'

class FakeTikTokConnection {
  constructor(username) {
    this.username = username
    this.listeners = new Map()
    this.disconnected = false
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, [])
    this.listeners.get(event).push(handler)
  }

  emit(event, data) {
    const handlers = this.listeners.get(event) || []
    for (const h of handlers) h(data)
  }

  async connect() {
    return { roomInfo: { user_count: 10 } }
  }

  disconnect() {
    this.disconnected = true
  }
}

test('connector manager runs both connectors concurrently and independently', async () => {
  const hub = new ChatHub()
  let fakeTikTok = null
  let youtubeChatCalls = 0

  const fakeFetch = async (url) => {
    const urlStr = String(url)
    if (urlStr.includes('/videos')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [{
            snippet: { title: 'Live Stream' },
            liveStreamingDetails: { concurrentViewers: '500', activeLiveChatId: 'yt_chat_1' },
          }],
        }),
      }
    }
    if (urlStr.includes('/liveChat/messages')) {
      youtubeChatCalls++
      return {
        ok: true,
        status: 200,
        json: async () => ({
          pollingIntervalMillis: 1000,
          nextPageToken: `token_${youtubeChatCalls}`,
          items: [
            {
              id: `yt_msg_${youtubeChatCalls}`,
              snippet: { publishedAt: new Date(1700000000000 + youtubeChatCalls * 1000).toISOString(), displayMessage: `YT message ${youtubeChatCalls}` },
              authorDetails: { displayName: `YTUser${youtubeChatCalls}` },
            },
          ],
        }),
      }
    }
    return { ok: false, status: 404 }
  }

  const manager = new ConnectorManager({
    chatHub: hub,
    onStatsUpdate: () => {},
    tiktokConnectionFactory: (username) => {
      fakeTikTok = new FakeTikTokConnection(username)
      return fakeTikTok
    },
    youtubeFetchFn: fakeFetch,
  })

  try {
    // 1. Enable both TikTok and YouTube simultaneously
    manager.applyConfig({
      version: 2,
      tiktok: { enabled: true, username: 'streamer_tt' },
      youtube: { enabled: true, apiKey: 'yt_key', videoId: 'yt_video', channelId: '' },
      stats: { pollIntervalMs: 60000 },
      notif: { displayMs: 4000, gapMs: 600, maxQueue: 20 },
      chatFormat: { tiktokTag: '[TT]', youtubeTag: '[YT]' },
      archive: { enabled: true },
    })

    await new Promise((resolve) => setTimeout(resolve, 80))

    // TikTok sends chat
    fakeTikTok.emit(WebcastEvent.CHAT, {
      msgId: 'tt_msg_1',
      content: 'Pesan dari TikTok!',
      user: { nickname: 'TikTokFan' },
    })

    // Wait for YouTube chat call to arrive
    await new Promise((resolve) => setTimeout(resolve, 80))

    const feed = hub.since(0)
    assert.equal(feed.items.length >= 2, true)
    const platforms = feed.items.map((it) => it.platform)
    assert.equal(platforms.includes('tiktok'), true)
    assert.equal(platforms.includes('youtube'), true)

    // 2. Stop TikTok: YouTube should remain active and healthy
    manager.stopPlatform('tiktok')
    assert.equal(fakeTikTok.disconnected, true)
    assert.equal(manager.getPlatformStatus('tiktok').enabled, false)
    assert.equal(manager.getPlatformStatus('youtube').enabled, true)
    assert.equal(manager.getPlatformStatus('youtube').running, true)

    // 3. Stop YouTube
    manager.stopPlatform('youtube')
    assert.equal(manager.getPlatformStatus('youtube').enabled, false)
  } finally {
    manager.stopAll()
  }
})
