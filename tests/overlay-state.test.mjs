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
  w.eval(fs.readFileSync(path.join(root, 'public/chat-format.js'), 'utf8'))
  w.eval(fs.readFileSync(path.join(root, 'public/text-binding.js'), 'utf8'))
  w.setInterval = () => 0
  w.setTimeout = () => 0
  const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n')
  w.eval(inline + '\nwindow.__h={renderScene,renderedElements,applyChatFeed,getElementActiveState,resolveChatText,resolveElementText,setControl:(v)=>{controlState=v},setChatIcons:(v)=>{chatIcons=v},chatState:()=>({seq:chatFeedSeq,events:chatEvents.slice(),notif:chatNotif,effectiveNotif:getEffectiveNotifState()})}')
  const h = w.__h
  const api = {
    w,
    setState: v => h.setControl({ counters: {}, eventStates: { G: { value: v, options: [] } }, timers: {}, texts: {} }),
    render: scene => h.renderScene(scene),
    feed: (payload, initial = false) => h.applyChatFeed(payload, initial),
    chat: () => h.chatState(),
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

// ─── Fase C5 — Chat Stack, Chat Notification, dan reload ─────────────────────

const chatEvent = (seq, platform, author, message) => ({ seq, id: `${platform}-${seq}`, platform, author, message, ts: seq * 1000 })
const idleNotif = { state: 'idle', seq: 0, author: '', message: '', platform: '', showUntil: 0, queueLength: 0 }
const chatScene = (patch = {}) => makeScene({
  type: 'text',
  style: { text: '', fontSize: 20, color: '#ffffff' },
  animation: { enter: { sequence: [], loop: false }, transition: { sequence: [] } },
  ...patch,
})

test('chat stack: N baris terakhir, urut lama→baru, terbaru di bawah, dengan tag platform', () => {
  const o = bootOverlay()
  o.feed({
    seq: 3,
    items: [
      chatEvent(1, 'tiktok', 'alice', 'satu'),
      chatEvent(2, 'youtube', 'bob', 'dua'),
      chatEvent(3, 'tiktok', 'cara', 'tiga'),
    ],
    notif: idleNotif,
  })
  o.render(chatScene({ textBinding: { enabled: true, source: 'chat', field: 'stack', lines: 2 } }))
  assert.equal(o.node().textContent, '[YT] bob: dua\n[TT] cara: tiga')
  assert.equal(o.chat().events.length, 3)
})

test('chat stack: template kustom dan batas lines dinormalisasi (1–30)', () => {
  const o = bootOverlay()
  o.feed({
    seq: 2,
    items: [chatEvent(1, 'tiktok', 'alice', 'satu'), chatEvent(2, 'youtube', 'bob', 'dua')],
    notif: idleNotif,
  })
  o.render(chatScene({ textBinding: { enabled: true, source: 'chat', field: 'stack', lines: 99, template: '{platform}: {author} > {message}' } }))
  assert.equal(o.node().textContent, 'tiktok: alice > satu\nyoutube: bob > dua')
})

test('chat notification: snapshot showing → idle mengubah state aktif elemen', () => {
  const o = bootOverlay()
  const scene = () => chatScene({
    textBinding: { enabled: true, source: 'chat', field: 'notif' },
    stateBinding: { enabled: true, source: 'chatNotif', fallbackState: 'idle' },
    stateTargets: { showing: { x: 100 }, idle: { x: 300, _visible: false } },
  })

  o.feed({
    seq: 1,
    items: [chatEvent(1, 'tiktok', 'alice', 'halo')],
    notif: { state: 'showing', seq: 1, author: 'alice', message: 'halo', platform: 'tiktok', showUntil: 1, queueLength: 0 },
  })
  o.render(scene())
  assert.equal(o.rec().currentState, 'showing')
  assert.equal(o.node().textContent, 'alice\nhalo')

  o.feed({
    seq: 1,
    items: [],
    notif: { state: 'idle', seq: 1, author: 'alice', message: 'halo', platform: 'tiktok', showUntil: 0, queueLength: 0 },
  })
  o.render(scene())
  assert.equal(o.rec().currentState, 'idle')
  // Teks terakhir dipertahankan saat idle supaya animasi keluar tidak kosong.
  assert.equal(o.node().textContent, 'alice\nhalo')
})

test('scene lama dengan latestChatAuthor/latestChatMessage tetap render dari chat terbaru', () => {
  const o = bootOverlay()
  o.feed({
    seq: 2,
    items: [chatEvent(1, 'tiktok', 'alice', 'satu'), chatEvent(2, 'youtube', 'bob', 'dua')],
    notif: idleNotif,
  })

  o.render(chatScene({ textBinding: { enabled: true, source: 'platform', field: 'latestChatAuthor' } }))
  assert.equal(o.node().textContent, 'bob')

  o.render(chatScene({ textBinding: { enabled: true, source: 'platform', field: 'latestChatMessage' } }))
  assert.equal(o.node().textContent, 'dua')
})

test('dua scene/overlay yang dibuka bersamaan menampilkan notif yang sama', () => {
  const scene = () => chatScene({
    textBinding: { enabled: true, source: 'chat', field: 'notif' },
    stateBinding: { enabled: true, source: 'chatNotif', fallbackState: 'idle' },
    stateTargets: { showing: { x: 100 }, idle: { x: 300, _visible: false } },
  })
  const payload = {
    seq: 1,
    items: [chatEvent(1, 'tiktok', 'alice', 'halo')],
    notif: { state: 'showing', seq: 1, author: 'alice', message: 'halo', platform: 'tiktok', showUntil: 1, queueLength: 0 },
  }
  const portrait = bootOverlay()
  const landscape = bootOverlay()
  portrait.feed(payload)
  landscape.feed(payload)
  portrait.render(scene())
  landscape.render(scene())
  assert.equal(portrait.rec().currentState, 'showing')
  assert.equal(landscape.rec().currentState, 'showing')
  assert.equal(portrait.node().textContent, landscape.node().textContent)
})

test('reload tidak memicu notif lama; chat baru berikutnya tetap tampil', () => {
  const o = bootOverlay()
  const scene = () => chatScene({
    textBinding: { enabled: true, source: 'chat', field: 'notif' },
    stateBinding: { enabled: true, source: 'chatNotif', fallbackState: 'idle' },
    stateTargets: { showing: { x: 100 }, idle: { x: 300, _visible: false } },
  })

  o.feed({
    seq: 5,
    items: [chatEvent(5, 'tiktok', 'lama', 'sudah lewat')],
    notif: { state: 'showing', seq: 5, author: 'lama', message: 'sudah lewat', platform: 'tiktok', showUntil: 1, queueLength: 0 },
  }, true)
  o.render(scene())
  assert.equal(o.rec().currentState, 'idle') // snapshot showing lama disuppress saat load pertama

  o.feed({
    seq: 6,
    items: [chatEvent(6, 'youtube', 'baru', 'baru masuk')],
    notif: { state: 'showing', seq: 6, author: 'baru', message: 'baru masuk', platform: 'youtube', showUntil: 2, queueLength: 0 },
  })
  o.render(scene())
  assert.equal(o.rec().currentState, 'showing')
  assert.equal(o.node().textContent, 'baru\nbaru masuk')
})

test('platformTag jadi ikon inline kalau file ikon tersedia, platform lain tetap teks tag', () => {
  const o = bootOverlay()
  o.w.__h.setChatIcons({ tiktok: '/chat-icons/tiktok.ico', youtube: '' })
  o.feed({
    seq: 2,
    items: [chatEvent(1, 'tiktok', 'alice', 'satu'), chatEvent(2, 'youtube', 'bob', 'dua')],
    notif: idleNotif,
  })
  o.render(chatScene({ textBinding: { enabled: true, source: 'chat', field: 'stack', lines: 5, template: '{platformTag} {author}: {message}' } }))

  const icons = o.node().querySelectorAll('img')
  assert.equal(icons.length, 1)
  assert.equal(icons[0].getAttribute('src'), '/chat-icons/tiktok.ico')
  assert.equal(o.node().textContent, ' alice: satu\n[YT] bob: dua')
})

test('review ▲/▼ memutar ulang animasi kemunculan walau state tetap showing', () => {
  const o = bootOverlay()
  const scene = () => chatScene({
    textBinding: { enabled: true, source: 'chat', field: 'notif' },
    stateBinding: { enabled: true, source: 'chatNotif', fallbackState: 'idle' },
    stateTargets: { showing: { x: 100 }, idle: { x: 300 } },
    animation: {
      enter: { sequence: [{ type: 'to', properties: { opacity: 1 }, duration: 0.1, ease: 'none' }], loop: false },
      transition: { sequence: [{ type: 'to', properties: ['x'], duration: 1, ease: 'none' }] },
    },
  })

  o.feed({ seq: 2, items: [chatEvent(2, 'tiktok', 'bob', 'dua')], notif: { state: 'showing', seq: 2, author: 'bob', message: 'dua', platform: 'tiktok', showUntil: 1, queueLength: 0 } }, true)
  o.render(scene())
  o.feed({ seq: 3, items: [chatEvent(3, 'tiktok', 'cara', 'tiga')], notif: { state: 'showing', seq: 3, author: 'cara', message: 'tiga', platform: 'tiktok', showUntil: 2, queueLength: 0 } })
  o.render(scene())
  o.tl()?.progress(1)
  const live = o.tl()

  o.feed({ seq: 3, items: [], notif: { state: 'showing', seq: 2, author: 'bob', message: 'dua', platform: 'tiktok', showUntil: 0, queueLength: 0, reviewing: true, reviewIndex: 0, reviewTotal: 2 } })
  o.render(scene())

  assert.equal(o.rec().currentState, 'showing')
  assert.equal(o.node().textContent, 'bob\ndua')
  const replayed = o.tl()
  assert.notEqual(replayed, live, 'transition kemunculan harus dibangun ulang saat review step')
  replayed.progress(1)
  assert.equal(o.x(), 0) // delta x ke target showing (x=100, baseline 100)
})
test('grup binding yang di-hide dari Control Panel menyembunyikan layer', () => {
  const o = bootOverlay()
  const state = (hiddenControls) => ({
    counters: {}, eventStates: { G: { value: '1', options: [] } }, timers: {}, texts: {}, hiddenControls,
  })

  o.w.__h.setControl(state({ 'eventState:G': true }))
  o.render(makeScene())
  assert.equal(o.vis(), 'hidden')

  o.w.__h.setControl(state({}))
  o.render(makeScene())
  assert.equal(o.vis(), 'visible')
})

test('override prefix/suffix dari Control Panel menimpa textBinding elemen', () => {
  const o = bootOverlay()
  o.w.__h.setControl({
    counters: { C: { value: 5, step: 1 } }, eventStates: {}, timers: {}, texts: {},
    textOverrides: { 'counter:C': { prefix: 'Q1 : ', suffix: ' pts' } },
  })
  const text = o.w.__h.resolveElementText({
    textBinding: { enabled: true, source: 'counter', group: 'C', prefix: 'Q3 : ', suffix: '' },
  })
  assert.equal(text, 'Q1 : 5 pts')
})
