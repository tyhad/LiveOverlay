import assert from 'node:assert/strict'
import { test } from 'node:test'
import { TikTokConnector } from '../src/connectors/tiktok.ts'
import { WebcastEvent, ControlEvent } from 'tiktok-live-connector'

class FakeTikTokConnection {
  constructor(username) {
    this.username = username
    this.listeners = new Map()
    this.disconnected = false
  }

  on(event, handler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(handler)
  }

  emit(event, data) {
    const handlers = this.listeners.get(event) || []
    for (const h of handlers) h(data)
  }

  async connect() {
    return {
      roomInfo: {
        owner: { nickname: 'Streamer', display_id: this.username },
        user_count: 50,
        like_count: 120,
      },
    }
  }

  disconnect() {
    this.disconnected = true
  }
}

test('tiktok connector forwards chat and room stats correctly', async () => {
  const chats = []
  const statsUpdates = []
  let fakeConn = null

  const connector = new TikTokConnector({
    onChat: (payload) => chats.push(payload),
    onStats: (stats) => statsUpdates.push(stats),
    connectionFactory: (username) => {
      fakeConn = new FakeTikTokConnection(username)
      return fakeConn
    },
  })

  try {
    connector.start('@mycreator')
    await new Promise((resolve) => setTimeout(resolve, 20))

    const status = connector.getStatus()
    assert.equal(status.running, true)
    assert.equal(status.isLive, true)
    assert.equal(statsUpdates.length >= 1, true)
    assert.equal(statsUpdates[0].username, '@mycreator')
    assert.equal(statsUpdates[0].viewerCount, 50)

    // Emit CHAT
    fakeConn.emit(WebcastEvent.CHAT, {
      msgId: 'tt_123',
      content: 'Halo TikTok!',
      user: { nickname: 'Viewer1' },
    })

    assert.equal(chats.length, 1)
    assert.equal(chats[0].id, 'tt_123')
    assert.equal(chats[0].author, 'Viewer1')
    assert.equal(chats[0].message, 'Halo TikTok!')
    assert.equal(chats[0].platform, 'tiktok')

    // Emit LIKE & ROOM_USER
    fakeConn.emit(WebcastEvent.LIKE, { total: 130 })
    fakeConn.emit(WebcastEvent.ROOM_USER, { total: 60 })
    assert.equal(statsUpdates.some((s) => s.likeCount === 130), true)
    assert.equal(statsUpdates.some((s) => s.viewerCount === 60), true)

    // Emit STREAM_END
    fakeConn.emit(WebcastEvent.STREAM_END)
    assert.equal(connector.getStatus().running, false)
    assert.equal(connector.getStatus().isLive, false)
  } finally {
    connector.stop()
    assert.equal(fakeConn?.disconnected, true)
  }
})
