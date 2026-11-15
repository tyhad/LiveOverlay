import assert from 'node:assert/strict'
import { test } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const window = {}
new Function('window', fs.readFileSync(path.join(root, 'public/text-binding.js'), 'utf8'))(window)
const TB = window.TextBinding

test('formatTimerMs: mm:ss (meluap ke menit), hh:mm:ss, seconds, negatif', () => {
  assert.equal(TB.formatTimerMs(90_000), '01:30')
  assert.equal(TB.formatTimerMs(3_661_000, 'hh:mm:ss'), '01:01:01')
  assert.equal(TB.formatTimerMs(125_000, 'seconds'), '125')
  assert.equal(TB.formatTimerMs(-15_000), '-00:15')
})

test('computeTimerDisplayMs: countdown berhenti di 0 kecuali continueBelowZero', () => {
  const timer = { mode: 'countdown', durationMs: 10_000, startedAtMs: 1_000, pausedAccumMs: 0, isRunning: true }
  assert.equal(TB.computeTimerDisplayMs(timer, 9_000), 2_000)
  assert.equal(TB.computeTimerDisplayMs(timer, 20_000), 0)
  assert.equal(TB.computeTimerDisplayMs({ ...timer, continueBelowZero: true }, 20_000), -9_000)
  assert.equal(TB.computeTimerDisplayMs({ mode: 'countup', startedAtMs: 1_000, isRunning: true }, 4_000), 3_000)
})

test('formatBoundValue dan getValueAtPath', () => {
  assert.equal(TB.formatBoundValue(1234, 'number'), (1234).toLocaleString())
  assert.equal(TB.formatBoundValue('abc', 'uppercase'), 'ABC')
  assert.equal(TB.formatBoundValue('', 'raw'), '')
  assert.equal(TB.getValueAtPath({ a: [{ b: 7 }] }, 'a[0].b'), 7)
  assert.equal(TB.getValueAtPath({ a: 1 }, 'a.b.c'), undefined)
})

test('getEffectiveParentId hanya menerima parent satu level', () => {
  const byId = new Map([
    ['p', { id: 'p' }],
    ['c', { id: 'c', parentId: 'p' }],
    ['x', { id: 'x', parentId: 'c' }],
  ])
  assert.equal(TB.getEffectiveParentId({ id: 'c', parentId: 'p' }, byId), 'p')
  assert.equal(TB.getEffectiveParentId({ id: 'x', parentId: 'c' }, byId), null)
  assert.equal(TB.getEffectiveParentId({ id: 'p', parentId: 'p' }, byId), null)
})
