import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { ChatHub } from '../src/chat-hub.ts'
import { NotifQueue } from '../src/notif-queue.ts'
import { ChatArchiveManager } from '../src/chat-archive.ts'

// Fase C7 — integrated stress test.
// 6000 chat dari dua platform, 50 chat/detik dalam burst 1 detik, satu burst
// setiap 5 detik => 120 burst = 10 menit waktu virtual. Waktu virtual dipakai
// supaya test tetap cepat; timer arsip/notif memakai jam yang di-inject.
const TOTAL_CHATS = 6_000
const BURST_SIZE = 50
const BURST_INTERVAL_MS = 5_000
const BURST_COUNT = TOTAL_CHATS / BURST_SIZE
const RING_CAPACITY = 500
const MAX_QUEUE = 20
const FEED_P95_LIMIT_MS = 50
const VIRTUAL_START = Date.UTC(2026, 0, 1, 0, 0, 0)

const baseDir = await mkdtemp(join(tmpdir(), 'liveoverlay-stress-'))
let clock = VIRTUAL_START

const archive = new ChatArchiveManager({ baseDir, now: () => clock })
const notif = new NotifQueue({
  displayMs: 4_000,
  gapMs: 600,
  maxQueue: MAX_QUEUE,
  now: () => clock,
})
const hub = new ChatHub({
  capacity: RING_CAPACITY,
  dedupeCapacity: 5_000,
  now: () => clock,
  notif,
  onChat: (event) => archive.appendChat(event),
})

let sessionId = null
const latencies = []
const platformCounts = { tiktok: 0, youtube: 0 }
let maxQueueSeen = 0
let maxBufferSeen = 0
let sequence = 0

try {
  sessionId = await archive.startSession()

  for (let burst = 0; burst < BURST_COUNT; burst++) {
    for (let i = 0; i < BURST_SIZE; i++) {
      sequence++
      const platform = sequence % 2 === 0 ? 'youtube' : 'tiktok'
      platformCounts[platform]++
      const event = hub.push({
        id: `stress-${sequence}`,
        platform,
        author: `viewer_${sequence}`,
        message: `stress message #${sequence}`,
        ts: clock + i * 20,
      })
      assert.ok(event, `chat #${sequence} should be accepted`)
    }

    clock += 1_000
    const firstSeq = sequence - BURST_SIZE + 1
    const startedAt = performance.now()
    const feed = hub.since(firstSeq - 1, 200)
    latencies.push(performance.now() - startedAt)

    assert.equal(feed.seq, sequence, 'feed sequence should match the last chat')
    assert.equal(feed.items.length, BURST_SIZE, 'each feed poll should return the full burst')
    assert.equal(feed.items[0]?.seq, firstSeq, 'feed should preserve server order')
    assert.equal(feed.items.at(-1)?.seq, sequence, 'feed should end at the newest chat')

    const snapshot = notif.getSnapshot()
    maxQueueSeen = Math.max(maxQueueSeen, snapshot.queueLength)
    assert.ok(
      snapshot.queueLength <= MAX_QUEUE,
      `notification queue ${snapshot.queueLength} exceeded maxQueue ${MAX_QUEUE}`
    )

    maxBufferSeen = Math.max(maxBufferSeen, hub.size)
    assert.ok(hub.size <= RING_CAPACITY, `ring buffer ${hub.size} exceeded capacity ${RING_CAPACITY}`)

    clock += BURST_INTERVAL_MS - 1_000
    if (burst % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
  }

  clock += 1_000
  await archive.flush()
  await archive.endSession()
  notif.stop()

  const session = await archive.readSessionLines(sessionId)
  const expectedSeqs = Array.from({ length: TOTAL_CHATS }, (_, i) => i + 1)
  assert.equal(session.chats.length, TOTAL_CHATS, 'archive must contain every chat')
  assert.deepEqual(session.chats.map((chat) => chat.seq), expectedSeqs, 'archive sequence must be complete')
  assert.equal(session.chats[0].platform, 'tiktok')
  assert.equal(session.chats.at(-1).platform, 'youtube')

  const sessions = await archive.listSessions()
  assert.equal(sessions.length, 1)
  assert.equal(sessions[0].id, sessionId)
  assert.equal(sessions[0].chatCount, TOTAL_CHATS)
  assert.equal(sessions[0].isActive, false)
  assert.equal(sessions[0].interrupted, false)

  const exported = await archive.exportSession(sessionId, { format: 'json' })
  const exportedJson = JSON.parse(exported.content)
  assert.equal(exportedJson.chats.length, TOTAL_CHATS, 'JSON export must include every chat')

  assert.equal(hub.size, RING_CAPACITY, 'ring buffer should be full but bounded')
  assert.equal(maxBufferSeen, RING_CAPACITY, 'ring buffer must never exceed capacity')
  assert.ok(maxQueueSeen <= MAX_QUEUE, 'notification queue stayed within maxQueue')

  latencies.sort((a, b) => a - b)
  const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))]
  const maxLatency = latencies.at(-1) || 0
  assert.ok(p95 <= FEED_P95_LIMIT_MS, `feed p95 latency ${p95.toFixed(2)}ms exceeded ${FEED_P95_LIMIT_MS}ms`)

  const virtualMinutes = ((BURST_COUNT * BURST_INTERVAL_MS) / 60_000).toFixed(1)
  console.log('Chat stress test passed')
  console.log(`  archived chats : ${session.chats.length}/${TOTAL_CHATS}`)
  console.log(`  platforms      : tiktok ${platformCounts.tiktok}, youtube ${platformCounts.youtube}`)
  console.log(`  ring buffer    : ${hub.size}/${RING_CAPACITY}`)
  console.log(`  notif queue    : max ${maxQueueSeen}/${MAX_QUEUE}`)
  console.log(`  feed latency   : p95 ${p95.toFixed(2)}ms, max ${maxLatency.toFixed(2)}ms`)
  console.log(`  virtual span   : ${virtualMinutes} minutes (${BURST_COUNT} bursts @ ${BURST_SIZE} chat/s)`)
} finally {
  notif.stop()
  if (sessionId && archive.getActiveSessionId()) await archive.endSession()
  await rm(baseDir, { recursive: true, force: true })
}
