// Unit test untuk F1 Team Radio theme matcher (public/f1-radio-theme.js)
// dan DOM renderer kartu F1 Radio (public/chat-format.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'
import F1RadioTheme from '../public/f1-radio-theme.js'

const { resolveF1RadioTheme } = F1RadioTheme

test('prioritas username menang atas isi chat yang menyebut tim berbeda', () => {
  const res = resolveF1RadioTheme('Tifosi_Leclerc16', 'Verstappen kenceng banget hari ini!')
  assert.equal(res.teamId, 'ferrari')
  assert.equal(res.matched, true)
  assert.equal(res.matchedBy, 'author')
  assert.equal(res.driver?.number, '16')
})

test('username tim-saja + mention driver tim yang sama di chat mengisi nomor driver', () => {
  const res = resolveF1RadioTheme('PapayaFan_ID', 'Piastri overtake mulus banget!')
  assert.equal(res.teamId, 'mclaren')
  assert.equal(res.matchedBy, 'author')
  assert.equal(res.driver?.number, '81')
})

test('username tim-saja + mention driver tim BERBEDA tetap pakai tim username tanpa nomor driver asing', () => {
  const res = resolveF1RadioTheme('ForzaFerrari99', 'Verstappen kenceng banget!')
  assert.equal(res.teamId, 'ferrari')
  assert.equal(res.matchedBy, 'author')
  assert.equal(res.driver, null)
})

test('dua tim berbeda di isi chat -> mention paling awal (kiri) yang menang', () => {
  const a = resolveF1RadioTheme('penonton123', 'Ferrari kenceng tapi McLaren juga ngeri')
  assert.equal(a.teamId, 'ferrari')
  assert.equal(a.matchedBy, 'message')

  const b = resolveF1RadioTheme('penonton123', 'McLaren dan Ferrari duel seru banget')
  assert.equal(b.teamId, 'mclaren')
  assert.equal(b.matchedBy, 'message')

  const c = resolveF1RadioTheme('penonton123', 'Russell vs Albon siapa menang?')
  assert.equal(c.teamId, 'mercedes')
  assert.equal(c.driver?.number, '63')
})

test('tim + driver dari tim yang sama dalam 1 pesan tetap dapat nomor driver', () => {
  const res = resolveF1RadioTheme('penonton_f1', 'Ferrari Leclerc strategi bannya gacor')
  assert.equal(res.teamId, 'ferrari')
  assert.equal(res.driver?.number, '16')
})

test('username menyatu tanpa spasi tetap terdeteksi akurat', () => {
  const a = resolveF1RadioTheme('ferrarifan99', 'halo bang')
  assert.equal(a.teamId, 'ferrari')
  assert.equal(a.driver, null)

  const b = resolveF1RadioTheme('OllieBearman87', 'nice one')
  assert.equal(b.teamId, 'haas')
  assert.equal(b.driver?.number, '87')

  const c = resolveF1RadioTheme('fan_LH44', 'mantap')
  assert.equal(c.teamId, 'ferrari')
  assert.equal(c.driver?.number, '44')
})

test('driver abbr & format nomor eksplisit bekerja sekaligus anti false-positive', () => {
  // Kata harian Indonesia/Inggris huruf kecil TIDAK boleh salah trigger
  for (const text of [
    'gas terus bang live nya!',
    'paham bro mantap',
    'maksimal banget kecepatannya',
    'lap 16 mulai hujan jam 10 malam',
    'he had a great start per lap',
    'terbang tinggi di tikungan',
  ]) {
    const res = resolveF1RadioTheme('penonton_biasa', text)
    assert.equal(res.teamId, 'f1', `Seharusnya netral untuk: "${text}", malah dapat ${res.teamId} (${res.matchedKeyword})`)
    assert.equal(res.matched, false)
  }

  // Abbr ambigu dalam HURUF BESAR penuh harus cocok
  assert.equal(resolveF1RadioTheme('viewer', 'GAS P5 mantap!').teamId, 'alpine')
  assert.equal(resolveF1RadioTheme('viewer', 'HAM vs LEC seru').teamId, 'ferrari')
  assert.equal(resolveF1RadioTheme('viewer', 'HAM vs LEC seru').driver?.number, '44')

  // Format #nomor & inisial+nomor eksplisit harus cocok
  assert.equal(resolveF1RadioTheme('viewer', 'semangat #81 podium!').teamId, 'mclaren')
  assert.equal(resolveF1RadioTheme('viewer', 'semangat #81 podium!').driver?.number, '81')
  assert.equal(resolveF1RadioTheme('viewer', 'GR63 lagi on fire').driver?.number, '63')
  assert.equal(resolveF1RadioTheme('viewer', 'VER lagi dominan').teamId, 'redbull')
})

test('sinkronisasi live driverStandings (perpindahan tim & pembalap baru) dan custom keywords', () => {
  const f1Drivers = [
    { driverName: 'Yuki Tsunoda', driverAbbr: 'TSU', teamName: 'Aston Martin' },
    { driverName: 'Carlos Sainz', driverAbbr: 'SAI', teamName: 'Audi' },
  ]
  const customKeywords = {
    teams: { ferrari: ['kuda jingkrak'] },
    drivers: [{ name: 'Fernando Alonso', number: '14', teamId: 'astonmartin', keywords: ['mbah alonso'] }],
  }

  const rookie = resolveF1RadioTheme('viewer', 'Tsunoda keren banget!', { f1Drivers })
  assert.equal(rookie.teamId, 'astonmartin')

  const moved = resolveF1RadioTheme('viewer', 'Sainz start P4', { f1Drivers })
  assert.equal(moved.teamId, 'audi')
  assert.equal(moved.driver?.number, '55')

  const customTeam = resolveF1RadioTheme('viewer', 'kuda jingkrak melesat!', { customKeywords })
  assert.equal(customTeam.teamId, 'ferrari')

  const customDriver = resolveF1RadioTheme('viewer', 'mbah alonso masih gacor', { customKeywords })
  assert.equal(customDriver.teamId, 'astonmartin')
  assert.equal(customDriver.driver?.number, '14')
})

test('prioritas f1Logos custom terpakai pada hasil tema', () => {
  const res = resolveF1RadioTheme('LeclercFan', 'forza', {
    f1Logos: { ferrari: '/f1-logos/ferrari.png' },
  })
  assert.equal(res.logoUrl, '/f1-logos/ferrari.png')
})

test('command ! di awal chat punya prioritas tertinggi dan mengupas prefix command dari displayMessage', () => {
  const anto = resolveF1RadioTheme('BudiBiasa', '!12 keren anto')
  assert.equal(anto.teamId, 'mercedes')
  assert.equal(anto.matchedBy, 'command')
  assert.equal(anto.driver?.number, '12')
  assert.equal(anto.displayMessage, 'keren anto')

  // Mengalahkan username tim berbeda
  const override = resolveF1RadioTheme('Tifosi_Leclerc16', '!81 papaya kenceng!')
  assert.equal(override.teamId, 'mclaren')
  assert.equal(override.matchedBy, 'command')
  assert.equal(override.driver?.number, '81')
  assert.equal(override.displayMessage, 'papaya kenceng!')

  // Abbr ambigu aman huruf kecil jika pakai !
  const gas = resolveF1RadioTheme('viewer', '!gas ayo podium!')
  assert.equal(gas.teamId, 'alpine')
  assert.equal(gas.driver?.number, '10')
  assert.equal(gas.displayMessage, 'ayo podium!')

  // Nama tim & paksa netral !f1
  const teamCmd = resolveF1RadioTheme('viewer', '!ferrari mantap bro')
  assert.equal(teamCmd.teamId, 'ferrari')
  assert.equal(teamCmd.driver, null)
  assert.equal(teamCmd.displayMessage, 'mantap bro')

  const neutralCmd = resolveF1RadioTheme('Tifosi_Leclerc16', '!f1 netral dulu ya')
  assert.equal(neutralCmd.teamId, 'f1')
  assert.equal(neutralCmd.matched, false)
  assert.equal(neutralCmd.displayMessage, 'netral dulu ya')

  // Command tidak dikenal tidak dipotong
  const unknown = resolveF1RadioTheme('viewer', '!halo bang gas terus')
  assert.equal(unknown.teamId, 'f1')
  assert.equal(unknown.displayMessage, '!halo bang gas terus')

  // Cuma "!12" tanpa sisa pesan tidak mengosongkan displayMessage
  const bare = resolveF1RadioTheme('viewer', '!12')
  assert.equal(bare.teamId, 'mercedes')
  assert.equal(bare.driver?.number, '12')
  assert.equal(bare.displayMessage, '!12')
})

function loadBrowserChatFormat() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><div id="target"></div></body></html>')
  const { window } = dom
  window.F1RadioTheme = F1RadioTheme
  const code = readFileSync(new URL('../public/chat-format.js', import.meta.url), 'utf8')
  vm.runInNewContext(code, {
    window,
    document: window.document,
    console,
    requestAnimationFrame: undefined,
  })
  return { dom, window, target: window.document.getElementById('target') }
}

test('ChatFormat.renderChatList mempertahankan TikTok Live secara default dan merender F1 Radio saat displayStyle=f1Radio', () => {
  const { window, target } = loadBrowserChatFormat()
  const item = {
    platform: 'tiktok',
    author: 'Tifosi_Leclerc16',
    message: 'Must be the water!',
    avatar: 'https://example.com/a.jpg',
    badges: [{ type: 'mod', label: 'MOD' }],
  }

  // Default (TikTok Live)
  window.ChatFormat.renderChatList(target, [item], { mode: 'notif' })
  assert.ok(target.querySelector('.tt-chat-list--single'))
  assert.equal(target.querySelector('.f1-radio-card'), null)

  // F1 Team Radio (driver match -> nomor 16 tampil, bukan avatar)
  window.ChatFormat.renderChatList(target, [item], {
    mode: 'notif',
    displayStyle: 'f1Radio',
    boxHeight: 320,
    fontSize: 24,
    f1Logos: { ferrari: '/f1-logos/ferrari.svg' },
  })
  const card = target.querySelector('.f1-radio-card')
  assert.ok(card)
  assert.equal(card.dataset.f1Team, 'ferrari')
  assert.equal(card.querySelector('.f1-radio-number')?.textContent, '16')
  assert.equal(card.querySelector('.f1-radio-avatar'), null)
  assert.equal(card.querySelector('.f1-radio-logo')?.getAttribute('src'), '/f1-logos/ferrari.svg')
  assert.equal(card.querySelector('.f1-radio-msg')?.textContent, '"Must be the water!"')
  assert.ok(Number(card.querySelector('.f1-radio-msg')?.style.webkitLineClamp) >= 1)

  // Signature guard: panggilan kedua dengan data sama tidak me-replace node DOM
  window.ChatFormat.renderChatList(target, [item], {
    mode: 'notif',
    displayStyle: 'f1Radio',
    boxHeight: 320,
    fontSize: 24,
    f1Logos: { ferrari: '/f1-logos/ferrari.svg' },
  })
  assert.equal(target.querySelector('.f1-radio-card'), card)

  // Team-only dengan avatar -> avatar tampil di slot kiri
  window.ChatFormat.renderChatList(target, [{
    platform: 'youtube',
    author: 'ScuderiaJakarta',
    message: 'Forza Ferrari!',
    avatar: 'https://example.com/b.jpg',
  }], {
    mode: 'notif',
    displayStyle: 'f1Radio',
    boxHeight: 260,
    fontSize: 22,
  })
  assert.equal(target.querySelector('.f1-radio-number'), null)
  assert.ok(target.querySelector('.f1-radio-avatar img'))

  // Netral tanpa avatar -> kode tim F1 tampil di slot kiri
  window.ChatFormat.renderChatList(target, [{
    platform: 'tiktok',
    author: 'PenontonBiasa',
    message: 'Gas terus bang!',
  }], {
    mode: 'notif',
    displayStyle: 'f1Radio',
    boxHeight: 145,
    fontSize: 32,
  })
  assert.equal(target.querySelector('.f1-radio-card')?.dataset.f1Team, 'f1')
  assert.equal(target.querySelector('.f1-radio-abbr')?.textContent, 'F1')

  // Command !12 keren anto -> Mercedes #12 dengan teks bersih "keren anto"
  window.ChatFormat.renderChatList(target, [{
    platform: 'tiktok',
    author: 'PenontonKeren',
    message: '!12 keren anto',
  }], {
    mode: 'notif',
    displayStyle: 'f1Radio',
    boxHeight: 280,
    fontSize: 24,
  })
  assert.equal(target.querySelector('.f1-radio-card')?.dataset.f1Team, 'mercedes')
  assert.equal(target.querySelector('.f1-radio-number')?.textContent, '12')
  assert.equal(target.querySelector('.f1-radio-msg')?.textContent, '"keren anto"')
})
