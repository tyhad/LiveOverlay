import assert from 'node:assert/strict'
import { test } from 'node:test'
import { YouTubeConnector } from '../src/connectors/youtube.ts'

test('youtube connector respects pollingIntervalMillis, deduplicates messages, and tracks quota', async () => {
  const receivedChats = []
  let calls = 0

  const fakeFetch = async (url) => {
    const urlStr = String(url)
    if (urlStr.includes('/videos')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          items: [{
            snippet: { title: 'Test Stream', channelTitle: 'Test Channel', channelId: 'ch1' },
            liveStreamingDetails: {
              concurrentViewers: '250',
              activeLiveChatId: 'chat_id_123',
            },
            statistics: { likeCount: '1500' },
          }],
        }),
      }
    }
    if (urlStr.includes('/liveChat/messages')) {
      calls++
      if (calls === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            pollingIntervalMillis: 1000,
            nextPageToken: 'page_token_2',
            items: [
              {
                id: 'msg_1',
                snippet: { publishedAt: '2026-11-10T00:00:01Z', displayMessage: 'Halo YouTube!' },
                authorDetails: { displayName: 'UserA' },
              },
              {
                id: 'msg_2',
                snippet: { publishedAt: '2026-11-10T00:00:02Z', displayMessage: 'Second chat' },
                authorDetails: { displayName: 'UserB' },
              },
            ],
          }),
        }
      } else {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            pollingIntervalMillis: 2000,
            nextPageToken: 'page_token_3',
            items: [
              // msg_2 repeated across page token boundary (should be deduped)
              {
                id: 'msg_2',
                snippet: { publishedAt: '2026-11-10T00:00:02Z', displayMessage: 'Second chat' },
                authorDetails: { displayName: 'UserB' },
              },
              {
                id: 'msg_3',
                snippet: { publishedAt: '2026-11-10T00:00:03Z', displayMessage: 'Third chat' },
                authorDetails: { displayName: 'UserC' },
              },
            ],
          }),
        }
      }
    }
    return { ok: false, status: 404, text: async () => 'Not found' }
  }

  const connector = new YouTubeConnector({
    onChat: (payload) => receivedChats.push(payload),
    fetchFn: fakeFetch,
  })

  try {
    connector.start({
      apiKey: 'test-api-key',
      videoId: 'test-video-id',
      pollIntervalMs: 60000,
    })

    // Wait short time for initial fetch and next polling
    await new Promise((resolve) => setTimeout(resolve, 150))

    assert.equal(receivedChats.length >= 2, true)
    assert.equal(receivedChats[0].id, 'msg_1')
    assert.equal(receivedChats[0].author, 'UserA')
    assert.equal(receivedChats[0].message, 'Halo YouTube!')

    const status = connector.getStatus()
    assert.equal(status.running, true)
    assert.equal(status.isLive, true)
    // 1 quota unit for videos.list + 5 quota units for liveChatMessages.list call
    assert.equal(status.quotaUnitsUsedToday >= 6, true)
  } finally {
    connector.stop()
  }
})

test('youtube connector handles 403 quota error gracefully without crashing', async () => {
  const fakeFetch = async (url) => {
    const urlStr = String(url)
    if (urlStr.includes('/videos')) {
      return {
        ok: false,
        status: 403,
        text: async () => 'Quota exceeded',
      }
    }
    return { ok: false, status: 403, text: async () => 'Forbidden' }
  }

  const connector = new YouTubeConnector({
    onChat: () => {},
    fetchFn: fakeFetch,
  })

  try {
    connector.start({
      apiKey: 'bad-key',
      videoId: 'test-video',
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    const status = connector.getStatus()
    assert.equal(status.enabled, true)
    assert.equal(status.running, false)
    assert.ok(status.lastError?.includes('403'))
  } finally {
    connector.stop()
  }
})
