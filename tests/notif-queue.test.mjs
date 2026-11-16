import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NotifQueue } from '../src/notif-queue.ts'

function clock() { let now = 0; const timers = []; return { now: () => now, setTimeout: (fn, ms) => timers.push({ fn, at: now + ms }), clearTimeout: () => {}, tick: (ms) => { now += ms; for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= now) timers.splice(i, 1)[0].fn() } } }
const event = (seq, id = String(seq)) => ({ seq, id, platform: 'tiktok', author: `a${seq}`, message: `m${seq}`, ts: 0 })

test('notification state, gap, overflow and retained text', () => {
  const fake = clock(); const queue = new NotifQueue({ displayMs: 1500, gapMs: 1, maxQueue: 2, ...fake })
  queue.push(event(1)); assert.equal(queue.getSnapshot().state, 'showing')
  queue.push(event(2)); queue.push(event(3)); queue.push(event(4))
  fake.tick(1500); assert.equal(queue.getSnapshot().state, 'idle'); assert.equal(queue.getSnapshot().author, 'a1')
  fake.tick(300); assert.equal(queue.getSnapshot().seq, 3)
  assert.equal(queue.getSnapshot().queueLength, 1)
})

test('review steps through shown notifications and resumes live', () => {
  const fake = clock(); const queue = new NotifQueue({ displayMs: 1500, gapMs: 1, maxQueue: 5, ...fake })
  queue.push(event(1)); queue.push(event(2)); queue.push(event(3))
  fake.tick(1500); fake.tick(300) // notif 2 tampil
  fake.tick(1500); fake.tick(300) // notif 3 tampil
  assert.equal(queue.getSnapshot().seq, 3)

  const up = queue.step('up')
  assert.equal(up.reviewing, true)
  assert.equal(up.seq, 2)
  assert.equal(up.reviewIndex, 1)
  assert.equal(up.reviewTotal, 3)

  assert.equal(queue.step('up').seq, 1)
  assert.equal(queue.step('up').seq, 1, 'mentok di chat paling lama')
  assert.equal(queue.step('down').seq, 2)
  assert.equal(queue.step('down').seq, 3)

  queue.push(event(4))
  assert.equal(queue.getSnapshot().seq, 3, 'chat baru tidak menimpa review')
  assert.equal(queue.getSnapshot().queueLength, 1)

  const live = queue.step('down')
  assert.equal(live.reviewing, false)
  assert.equal(live.seq, 4, 'keluar review langsung menampilkan antrean')
})
