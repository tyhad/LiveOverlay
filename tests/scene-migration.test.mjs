// Test migrasi scene lama (visibilityBinding / exitSequence / animation.sequence) ke model State Binding.
// Jalan lewat `bun test tests/scene-migration.test.mjs` (import langsung ke .ts).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { migrateLegacyElement } from '../src/scene-migration.ts'

const base = { id: 'a', type: 'shape', x: 100, y: 50, width: 100, height: 40, opacity: 0.8 }

const legacyVisibility = (patch = {}) => ({
  enabled: true, source: 'eventState', group: 'G', matchValue: 'live', ...patch,
})

test('eventState eq dimigrasi ke stateBinding + stateTargets, visibilityBinding hilang', () => {
  const out = migrateLegacyElement({ ...base, visibilityBinding: legacyVisibility() })
  assert.equal('visibilityBinding' in out, false)
  assert.deepEqual(out.stateBinding, { enabled: true, source: 'eventState', group: 'G', fallbackState: 'hidden' })
  assert.deepEqual(out.stateTargets.live, { opacity: 0.8 })
  assert.deepEqual(out.stateTargets.hidden, { opacity: 0, _visible: false })
})

test('counter eq dibandingkan sebagai angka: "05" menjadi key "5"', () => {
  const out = migrateLegacyElement({ ...base, visibilityBinding: legacyVisibility({ source: 'counter', matchValue: '05' }) })
  assert.ok(out.stateTargets['5'])
  assert.equal(out.stateBinding.source, 'counter')
})

test('comparator non-eq TIDAK dibuang: visibilityBinding dan exitSequence dipertahankan', () => {
  const exitSequence = [{ type: 'to', properties: { opacity: 0 }, duration: 0.3 }]
  const el = {
    ...base,
    visibilityBinding: legacyVisibility({ source: 'counter', comparator: 'gt', matchValue: 3 }),
    animation: { sequence: [], loop: false, exitSequence },
  }
  const out = migrateLegacyElement(el)
  assert.deepEqual(out.visibilityBinding, el.visibilityBinding)
  assert.equal(out.stateBinding, undefined)
  assert.deepEqual(out.animation.exitSequence, exitSequence)
})

test('binding nonaktif dibuang tanpa efek; exitSequence ikut hilang karena memang tidak pernah jalan', () => {
  const out = migrateLegacyElement({
    ...base,
    visibilityBinding: legacyVisibility({ enabled: false }),
    animation: { sequence: [], loop: false, exitSequence: [{ type: 'to', properties: { opacity: 0 }, duration: 1 }] },
  })
  assert.equal('visibilityBinding' in out, false)
  assert.equal(out.stateBinding, undefined)
  assert.equal(out.animation.exitSequence, undefined)
})

test('exitSequence menjadi transition + target hidden, kembali ke state tampil dimainkan terbalik', () => {
  const out = migrateLegacyElement({
    ...base,
    visibilityBinding: legacyVisibility(),
    animation: {
      sequence: [], loop: false,
      exitSequence: [
        { type: 'to', properties: { x: -200, opacity: 0 }, duration: 0.5, ease: 'power2.in' },
        { type: 'delay', duration: 0.2 },
      ],
    },
  })
  assert.deepEqual(out.stateTargets.hidden, { x: -200, opacity: 0, _visible: false })
  assert.equal(out.stateTargets.live._direction, 'reverse')
  assert.deepEqual(out.animation.transition.sequence, [
    { id: null, type: 'to', properties: ['x', 'opacity'], duration: 0.5, ease: 'power2.in' },
    { id: null, type: 'delay', duration: 0.2 },
  ])
  assert.equal(out.animation.exitSequence, undefined)
})

test('exit tanpa step opacity: ditambah step opacity instan supaya elemen bisa muncul lagi', () => {
  const out = migrateLegacyElement({
    ...base,
    visibilityBinding: legacyVisibility(),
    animation: { sequence: [], exitSequence: [{ type: 'to', properties: { x: 900 }, duration: 0.4 }] },
  })
  const last = out.animation.transition.sequence.at(-1)
  assert.deepEqual(last, { id: null, type: 'to', properties: ['opacity'], duration: 0, ease: 'none' })
  assert.equal(out.stateTargets.hidden.opacity, 0)
})

test('step exit bertipe from dilewati, bukan membuat migrasi gagal', () => {
  const out = migrateLegacyElement({
    ...base,
    visibilityBinding: legacyVisibility(),
    animation: { sequence: [], exitSequence: [
      { type: 'from', properties: { x: 10 }, duration: 0.2 },
      { type: 'to', properties: { opacity: 0 }, duration: 0.2 },
    ] },
  })
  assert.equal(out.animation.transition.sequence.length, 1)
  assert.deepEqual(out.animation.transition.sequence[0].properties, ['opacity'])
})

test('matchValue "hidden" tidak bentrok dengan key state hidden', () => {
  const out = migrateLegacyElement({ ...base, visibilityBinding: legacyVisibility({ matchValue: 'hidden' }) })
  assert.equal(out.stateBinding.fallbackState, '__hidden')
  assert.deepEqual(out.stateTargets.hidden, { opacity: 0.8 })
  assert.equal(out.stateTargets.__hidden._visible, false)
})

test('animation lama tanpa binding: x/y absolut menjadi offset, delay per-step dipecah, loop dipertahankan', () => {
  const out = migrateLegacyElement({
    ...base,
    animation: {
      loop: true,
      sequence: [
        { id: 's1', type: 'from', properties: { x: -100, y: 0, opacity: 0 }, duration: 1, delay: 0.5 },
        { id: 's2', type: 'delay', duration: 2 },
      ],
    },
  })
  assert.equal(out.animation.enter.loop, true)
  assert.deepEqual(out.animation.enter.sequence.map((s) => s.type), ['delay', 'from', 'delay'])
  const from = out.animation.enter.sequence[1]
  assert.deepEqual(from.properties, { x: -200, y: -50, opacity: 0 }) // x: -100-100, y: 0-50
  assert.deepEqual(out.animation.transition, { sequence: [] })
})

test('idempoten: hasil migrasi dimigrasi lagi tidak berubah; elemen skema baru dikembalikan sama persis', () => {
  const once = migrateLegacyElement({
    ...base,
    visibilityBinding: legacyVisibility(),
    animation: { sequence: [{ type: 'to', properties: { x: 300 }, duration: 1 }], exitSequence: [{ type: 'to', properties: { opacity: 0 }, duration: 1 }] },
  })
  assert.equal(migrateLegacyElement(once), once)
  const fresh = { ...base, animation: { enter: { sequence: [], loop: false }, transition: { sequence: [] } } }
  assert.equal(migrateLegacyElement(fresh), fresh)
})

test('input tidak dimutasi', () => {
  const el = {
    ...base,
    visibilityBinding: legacyVisibility(),
    animation: { sequence: [{ type: 'from', properties: { x: 0 }, duration: 1 }], exitSequence: [{ type: 'to', properties: { opacity: 0 }, duration: 1 }] },
  }
  const snapshot = JSON.parse(JSON.stringify(el))
  migrateLegacyElement(el)
  assert.deepEqual(el, snapshot)
})
