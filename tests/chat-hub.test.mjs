import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ChatHub } from '../src/chat-hub.ts'

test('dedupe, monotonic sequence, bounded ring, and reset feed', () => {
  let writes = 0
  const hub = new ChatHub({ capacity: 3, onChat: () => { writes++ } })
  assert.equal(hub.push({ platform: 'tiktok', id: '1', author: 'a', message: 'one' }).seq, 1)
  assert.equal(hub.push({ platform: 'tiktok', id: '1', author: 'a', message: 'one' }), null)
  for (const id of ['2', '3', '4', '5']) hub.push({ platform: 'youtube', id, author: 'b', message: id })
  assert.equal(writes, 5)
  assert.deepEqual(hub.since(0).items.map(item => item.seq), [3, 4, 5])
  assert.equal(hub.since(1).resetRequired, true)
  assert.deepEqual(hub.since(4).items.map(item => item.seq), [5])
})
