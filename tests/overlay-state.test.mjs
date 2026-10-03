// Test integrasi overlay.html: resolusi state tak terdaftar -> fallback, toggle visible/invisible per state,
// dan arah transition per state. Menjalankan overlay.html utuh di jsdom (tanpa browser).
import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const windows = []
after(() => windows.forEach(w => w.close())) // tutup timer jsdom/gsap supaya proses test selesai

function bootOverlay() {
  const html = fs.readFileSync(path.join(root, 'public/overlay.html'), 'utf8').replace(/<script src="[^"]*"><\/script>/g, '')
  const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true })
  const w = dom.window
  windows.push(w)
  w.fetch = async () => ({ ok: false, status: 404, json: async () => ({}), text: async () => '' })
  w.eval(fs.readFileSync(path.join(root, 'node_modules/gsap/dist/gsap.min.js'), 'utf8'))
  w.eval(fs.readFileSync(path.join(root, 'public/animation-engine.js'), 'utf8'))
  w.setInterval = () => 0
  w.setTimeout = () => 0
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
  w.eval(inline + '\nwindow.__h={renderScene,renderedElements,setControl:(v)=>{controlState=v}}')
  const h = w.__h
  const api = {
    w,
    setState: v => h.setControl({ counters: {}, eventStates: { G: { value: v, options: [] } }, timers: {}, texts: {} }),
    render: scene => h.renderScene(scene),
    rec: () => h.renderedElements.get('a'),
    node: () => w.document.getElementById('render-el-a'),
    vis: () => (w.document.getElementById('render-el-a').style.visibility || 'visible'),
    tl: () => w.AnimationEngine._timelineRegistry?.get?.('a')?.timeline,
    x: () => w.gsap.getProperty(w.document.getElementById('render-el-a'), 'x'),
  }
  return api
}

const makeScene = (patch = {}) => ({
  elements: [{
    id: 'a', x: 100, y: 100, width: 100, height: 50, type: 'shape', zIndex: 1, opacity: 1,
    stateBinding: { enabled: true, source: 'eventState', group: 'G', fallbackState: 'default' },
    stateTargets: { default: { x: 100 }, '1': { x: 100 }, '2': { x: 300 }, off: { opacity: 0, _visible: false } },
    animation: { enter: { sequence: [], loop: false }, transition: { sequence: [{ type: 'to', properties: ['x', 'opacity'], duration: 1, ease: 'none' }] } },
    ...patch,
  }],
})

test('state yang tidak punya target memakai target fallback', () => {
  const o = bootOverlay()
  o.setState('2'); o.render(makeScene())
  assert.equal(o.rec().currentState, '2')
  o.setState('9'); o.render(makeScene())
  assert.equal(o.rec().currentState, 'default') // dinormalisasi ke fallback
  o.tl()?.progress(1)
  assert.equal(o.x() + 100, 100) // sampai di target fallback (x=100)
})

test('pindah antar state yang sama-sama tidak terdaftar tidak memicu transition ulang', () => {
  const o = bootOverlay()
  o.setState('2'); o.render(makeScene())
  o.setState('7'); o.render(makeScene())
  o.tl()?.progress(1)
  const before = o.tl()
  o.setState('8'); o.render(makeScene())
  assert.equal(o.tl(), before)
})

test('masuk state invisible: tetap tampil selama transition, disembunyikan setelah selesai', () => {
  const o = bootOverlay()
  o.setState('2'); o.render(makeScene()); o.tl()?.progress(1)
  o.setState('off'); o.render(makeScene())
  const t = o.tl()
  assert.equal(o.vis(), 'visible')
  t.progress(0.5); o.render(makeScene()) // poll di tengah transition tidak boleh menyembunyikan
  assert.equal(o.vis(), 'visible')
  t.progress(1)
  assert.equal(o.vis(), 'hidden')
  o.render(makeScene())
  assert.equal(o.vis(), 'hidden')
})

test('kembali ke state visible: elemen tampil lebih dulu sebelum fade-in', () => {
  const o = bootOverlay()
  o.setState('off'); o.render(makeScene())
  assert.equal(o.vis(), 'hidden') // mount awal di state invisible
  o.setState('1'); o.render(makeScene())
  assert.equal(o.vis(), 'visible')
})

test('tanpa transition step: invisible langsung berlaku', () => {
  const o = bootOverlay()
  const noTransition = () => makeScene({ animation: { enter: { sequence: [], loop: false }, transition: { sequence: [] } } })
  o.setState('1'); o.render(noTransition())
  o.setState('off'); o.render(noTransition())
  assert.equal(o.vis(), 'hidden')
})

test('hidden manual selalu menang atas state visible', () => {
  const o = bootOverlay()
  o.setState('1'); o.render(makeScene({ hidden: true }))
  assert.equal(o.vis(), 'hidden')
  o.render(makeScene())
  assert.equal(o.vis(), 'visible')
})

test('loop enter dilanjutkan setelah pindah state tanpa transition step', () => {
  const o = bootOverlay()
  const withLoop = () => makeScene({ animation: {
    enter: { loop: false, sequence: [{ type: 'to', properties: { scale: 1.1 }, duration: 1, repeat: -1, yoyo: true }] },
    transition: { sequence: [] },
  } })
  o.setState('1'); o.render(withLoop())
  o.setState('2'); o.render(withLoop())
  const t = o.tl()
  assert.ok(t, 'timeline loop harus aktif setelah pindah state')
  assert.equal(t.getChildren()[0].repeat(), -1) // step loop (repeat tak hingga) berjalan lagi
})