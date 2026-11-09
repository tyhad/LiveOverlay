import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rm } from 'node:fs/promises'
import {
  ChatArchiveManager,
  formatTimeSrt,
  formatTimeVtt,
  parseVideoTime,
} from '../src/chat-archive.ts'

const testDir = `.tmp-chat-archive-${Date.now()}`

test('chat archive appends, flushes, and tolerates interrupted/corrupt lines', async () => {
  const baseTs = 1700000000000
  let clock = baseTs
  const manager = new ChatArchiveManager({ baseDir: testDir, now: () => clock })

  try {
    const sessionId = await manager.startSession()
    assert.ok(sessionId)

    for (let i = 1; i <= 5; i++) {
      clock += 1000
      manager.appendChat({
        seq: i,
        id: `msg_${i}`,
        platform: i % 2 === 0 ? 'youtube' : 'tiktok',
        author: `User${i}`,
        message: `Hello world ${i}`,
        ts: clock,
      })
    }

    await manager.flush()

    // Append a broken (truncated) last line simulating crash mid-write
    const filePath = `${testDir}/${sessionId}.jsonl`
    await Bun.write(filePath, (await Bun.file(filePath).text()) + '{"type":"chat", broken json\n')

    const read = await manager.readSessionLines(sessionId)
    assert.equal(read.chats.length, 5)
    assert.equal(read.chats[0].author, 'User1')

    const sessions = await manager.listSessions()
    assert.equal(sessions.length, 1)
    assert.equal(sessions[0].isActive, true)

    clock += 1000
    await manager.endSession()
    const endedSessions = await manager.listSessions()
    assert.equal(endedSessions[0].isActive, false)
    assert.equal(endedSessions[0].interrupted, false)
    assert.ok(endedSessions[0].endedAt)
  } finally {
    await rm(testDir, { recursive: true, force: true })
  }
})

test('subtitle formatting helpers and export (SRT, VTT, CSV, JSON)', async () => {
  assert.equal(formatTimeSrt(0), '00:00:00,000')
  assert.equal(formatTimeSrt(65.123), '00:01:05,123')
  assert.equal(formatTimeVtt(0), '00:00:00.000')
  assert.equal(formatTimeVtt(3665.456), '01:01:05.456')
  assert.equal(parseVideoTime('12:34'), 754)
  assert.equal(parseVideoTime('01:02:03'), 3723)

  const baseTs = 1700000000000
  let clock = baseTs
  const manager = new ChatArchiveManager({ baseDir: testDir, now: () => clock })

  try {
    const sessionId = await manager.startSession()

    manager.appendChat({ seq: 1, id: '1', platform: 'tiktok', author: 'Alice', message: 'Chat 1', ts: baseTs + 1000 })
    manager.appendChat({ seq: 2, id: '2', platform: 'youtube', author: 'Bob', message: 'Chat 2 <tag> & more', ts: baseTs + 3000 })
    manager.appendChat({ seq: 3, id: '3', platform: 'tiktok', author: 'Hacker', message: '=cmd|/c calc!A0', ts: baseTs + 5000 })
    await manager.flush()
    clock += 10000
    await manager.endSession()

    // VTT: HTML escaping + tags
    const vtt = await manager.exportSession(sessionId, { format: 'vtt', mode: 'single', ttl: 5 })
    assert.ok(vtt.content.startsWith('WEBVTT'))
    assert.ok(vtt.content.includes('&lt;tag&gt; &amp; more'), 'VTT should escape HTML entities')
    assert.ok(vtt.content.includes('[TT] Alice: Chat 1'))
    assert.ok(vtt.content.includes('[YT] Bob: Chat 2'))

    // SRT stack mode
    const srt = await manager.exportSession(sessionId, { format: 'srt', mode: 'stack', lines: 3, ttl: 8 })
    assert.ok(srt.content.includes('00:00:01,000 -->'), 'SRT should contain first chat timestamp')
    assert.ok(srt.content.includes('[TT] Alice: Chat 1'))

    // CSV injection protection
    const csv = await manager.exportSession(sessionId, { format: 'csv' })
    assert.ok(csv.content.includes("'=cmd|/c calc!A0"), 'CSV should prefix injection chars')

    // Alignment helper: Chat 2 at t=3s. Video time=10s → offset = 10 - 3 = 7
    const align = await manager.calculateAlignment(sessionId, 2, '00:10')
    assert.equal(align.offsetSec, 7)

    // Offset clipping: Chat 1 at 1s + (-0.5s) = 0.5s
    const srtNeg = await manager.exportSession(sessionId, { format: 'srt', mode: 'single', offset: -0.5, ttl: 2 })
    assert.ok(srtNeg.content.includes('00:00:00,500 -->'), 'negative offset should shift timestamps')
  } finally {
    await rm(testDir, { recursive: true, force: true })
  }
})

test('acceptance criteria: 6000 chats flushed without loss, SRT export valid', async () => {
  const baseTs = 1700000000000
  let clock = baseTs
  const manager = new ChatArchiveManager({ baseDir: testDir, now: () => clock })

  try {
    const sessionId = await manager.startSession()

    for (let i = 1; i <= 6000; i++) {
      manager.appendChat({
        seq: i,
        id: `sim_${i}`,
        platform: i % 2 === 0 ? 'youtube' : 'tiktok',
        author: `Viewer_${i}`,
        message: `ChatMessage content #${i}`,
        ts: baseTs + i * 50,
      })
    }

    await manager.flush()
    clock += 6000 * 50 + 1000
    await manager.endSession()

    const session = await manager.readSessionLines(sessionId)
    assert.equal(session.chats.length, 6000)

    const srt = await manager.exportSession(sessionId, { format: 'srt', mode: 'stack', lines: 5, ttl: 6 })
    assert.ok(srt.content.length > 1000)
    assert.equal(srt.content.includes('-00:'), false, 'SRT must not have negative timestamps')
    assert.ok(srt.content.includes('00:00:00,050 -->'), 'SRT should start at first chat time')
  } finally {
    await rm(testDir, { recursive: true, force: true })
  }
})
