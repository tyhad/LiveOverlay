import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ControlStateStore, getTimerDisplayMs, validateControlKey, validateControlName } from '../src/control-state.ts'

function memoryStore(initial = null, now = () => 1000) {
  let saved = initial
  return {
    store: new ControlStateStore({
      load: async () => saved,
      save: async (state) => { saved = JSON.parse(JSON.stringify(state)) },
    }, now),
    readSaved: () => saved,
  }
}

test('50 increment paralel tetap menghasilkan nilai 50', async () => {
  const { store } = memoryStore()
  await Promise.all(Array.from({ length: 50 }, () => store.bumpCounter('score', 1)))
  assert.equal((await store.read()).counters.score.value, 50)
})

test('nama reserved ditolak dan prototype tetap bersih', async () => {
  for (const name of ['__proto__', 'constructor', 'prototype']) {
    assert.match(validateControlName(name), /reserved/)
  }
  const { store } = memoryStore()
  await store.bumpCounter('__proto__', 1)
  const state = await store.read()
  assert.equal(Object.prototype.value, undefined)
  assert.equal(Object.getPrototypeOf(state.counters), null)
})

test('timer pause/resume, no-op start, restart, reset, dan countdown', async () => {
  let clock = 1000
  const { store } = memoryStore(null, () => clock)
  await store.startTimer('race', 'countup')
  const started = (await store.read()).timers.race.startedAtMs
  clock = 2500
  await store.startTimer('race')
  assert.equal((await store.read()).timers.race.startedAtMs, started)
  await store.pauseTimer('race')
  assert.equal((await store.read()).timers.race.pausedAccumMs, 1500)
  clock = 5000
  await store.startTimer('race')
  assert.equal(getTimerDisplayMs((await store.read()).timers.race, clock), 1500)
  await store.startTimer('race', undefined, undefined, true)
  assert.equal((await store.read()).timers.race.pausedAccumMs, 0)
  await store.resetTimer('race')
  assert.equal((await store.read()).timers.race.isRunning, false)
  await store.configureTimer('down', { mode: 'countdown', durationMs: 1000 })
  await store.startTimer('down')
  clock = 7000
  let timer = (await store.read()).timers.down
  assert.equal(getTimerDisplayMs(timer, clock), 0)
  await store.configureTimer('down', { continueBelowZero: true })
  timer = (await store.read()).timers.down
  assert.equal(getTimerDisplayMs(timer, clock), -1000)
})

test('state tersimpan dan dapat dibaca ulang lewat load/save inject', async () => {
  const memory = memoryStore()
  await memory.store.setControlText('headline', 'tersimpan')
  const restarted = new ControlStateStore({
    load: async () => memory.readSaved(),
    save: async () => {},
  })
  assert.equal((await restarted.read()).texts.headline.value, 'tersimpan')
})

test('hidden control dan override prefix/suffix tersimpan serta bisa di-reset', async () => {
  const { store } = memoryStore()
  await store.setControlHidden('timer:Timer', true)
  await store.setTextOverride('timer:Timer', { prefix: 'Q1 : ', suffix: ' left' })
  let state = await store.read()
  assert.equal(state.hiddenControls['timer:Timer'], true)
  assert.deepEqual({ ...state.textOverrides['timer:Timer'] }, { prefix: 'Q1 : ', suffix: ' left' })

  await store.setControlHidden('timer:Timer', false)
  await store.clearTextOverride('timer:Timer')
  state = await store.read()
  assert.equal(state.hiddenControls['timer:Timer'], undefined)
  assert.equal(state.textOverrides['timer:Timer'], undefined)
})

test('normalisasi membuang hidden/override yang tidak valid', async () => {
  const { store } = memoryStore({
    counters: {}, eventStates: {}, timers: {}, texts: {},
    hiddenControls: { 'timer:A': true, 'timer:B': false, 'timer:C': 'yes' },
    textOverrides: { 'text:X': { prefix: 'a', suffix: 5 }, 'text:Y': null },
  })
  const state = await store.read()
  assert.equal(state.hiddenControls['timer:A'], true)
  assert.equal(state.hiddenControls['timer:B'], undefined)
  assert.equal(state.hiddenControls['timer:C'], undefined)
  assert.deepEqual({ ...state.textOverrides['text:X'] }, { prefix: 'a', suffix: '' })
  assert.equal(state.textOverrides['text:Y'], undefined)
})

test('validateControlKey menolak format, jenis, dan nama yang tidak valid', () => {
  assert.equal(validateControlKey('timer:Timer'), null)
  assert.equal(validateControlKey('eventState:raceFlag'), null)
  assert.match(validateControlKey('timer'), /Format/)
  assert.match(validateControlKey('bogus:X'), /Jenis/)
  assert.match(validateControlKey('timer:'), /wajib/)
  assert.match(validateControlKey('timer:__proto__'), /reserved/)
  assert.match(validateControlKey(`timer:${'a'.repeat(65)}`), /64/)
})
