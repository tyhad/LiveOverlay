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
