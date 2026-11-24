#!/usr/bin/env bun
/**
 * Pengirim dummy chat ke /api/chat/dev-inject untuk preview di OBS / Overlay.
 *
 * Pemakaian:
 *   bun run dummy-chat
 *   bun run dummy-chat -- --loop
 *   bun run dummy-chat -- --interval 3
 *   bun run dummy-chat -- --author "Tifosi_Leclerc16" --message "Box box!" --platform youtube
 */

const PORT = process.env.PORT || 3000
const HOST = process.env.HOST || '127.0.0.1'
const BASE_URL = process.env.OVERLAY_URL || `http://${HOST}:${PORT}`
const SECRET = process.env.SETTINGS_SECRET || ''

const DUMMY_CHATS = [
  {
    label: 'Command !12 -> Mercedes #12 Antonelli (tampil "keren anto")',
    platform: 'tiktok',
    author: 'PenontonKeren',
    message: '!12 keren anto',
    badges: [{ type: 'sub', label: 'SUB' }],
  },
  {
    label: 'Command !44 mengalahkan username Red Bull -> Ferrari #44',
    platform: 'youtube',
    author: 'SuperMax_ID',
    message: '!44 comeback is real, gas podium!',
  },
  {
    label: 'Command !ferrari -> Ferrari tim-saja + avatar',
    platform: 'tiktok',
    author: 'RakaSantuy',
    message: '!ferrari strategi ban soft mantap banget!',
    avatar: 'https://api.dicebear.com/9.x/thumbs/svg?seed=RakaSantuy',
  },
  {
    label: 'Command !gas (huruf kecil aman pakai !) -> Alpine #10',
    platform: 'youtube',
    author: 'F1IndoCrew',
    message: '!gas ayo kejar poin di lap terakhir!',
  },
  {
    label: 'Ferrari — Driver match via username (#16)',
    platform: 'tiktok',
    author: 'Tifosi_Leclerc16',
    message: 'Must be the water! Strategi ban merah kali ini gacor banget!',
    badges: [{ type: 'sub', label: 'SUB' }],
  },
  {
    label: 'Red Bull — Driver match via isi chat (#3)',
    platform: 'youtube',
    author: 'BudiBalap99',
    message: 'Verstappen sektor 2 ungu semua bro, kenceng banget!',
    badges: [{ type: 'mod', label: 'MOD' }],
  },
  {
    label: 'McLaren — Team username + driver chat (#81)',
    platform: 'tiktok',
    author: 'PapayaFan_ID',
    message: 'Piastri overtake di tikungan 1 mulus banget!',
  },
  {
    label: 'Mercedes — Driver match via #nomor (#63)',
    platform: 'youtube',
    author: 'AnakF1Jakarta',
    message: 'Pace race #63 stabil parah di stint ini',
  },
  {
    label: 'Prioritas username (Ferrari menang atas Verstappen di chat)',
    platform: 'tiktok',
    author: 'LH44_FansIndo',
    message: 'Verstappen cepet sih tapi Hamilton siap nyalip di DRS zone!',
  },
  {
    label: 'Williams — Driver match (#23)',
    platform: 'tiktok',
    author: 'Albono_23',
    message: 'Guys, come on, let us not be stupid! Poin ganda yuk malam ini!',
  },
  {
    label: 'Haas — Username menyatu (#87)',
    platform: 'youtube',
    author: 'OllieBearman87',
    message: 'Nice one Ollie! Langsung tembus Q3!',
  },
  {
    label: 'Aston Martin — Driver match (#14)',
    platform: 'tiktok',
    author: 'ElPlan_Fans',
    message: 'Alonso bertahan 20 lap di DRS train, kelas banget!',
  },
  {
    label: 'Alpine — Abbr HURUF BESAR (GAS #10)',
    platform: 'youtube',
    author: 'NontonF1Bareng',
    message: 'GAS start P8, siap serang di lap pertama!',
  },
  {
    label: 'Racing Bulls (#30)',
    platform: 'tiktok',
    author: 'VCARB_Indo',
    message: 'Lawson late braking mantap banget di chicane!',
  },
  {
    label: 'Audi (#27)',
    platform: 'youtube',
    author: 'Hulk27_ID',
    message: 'Audi musim debut langsung kompetitif di midfield!',
  },
  {
    label: 'Cadillac (#11)',
    platform: 'tiktok',
    author: 'Checo_Fans',
    message: 'Cadillac resmi di grid F1, mantap Perez!',
  },
  {
    label: 'Team-only (tanpa driver — tampil Avatar / Kode FER)',
    platform: 'tiktok',
    author: 'ScuderiaJakarta',
    message: 'Forza Ferrari! Semoga podium ganda hari ini!',
    avatar: 'https://api.dicebear.com/9.x/thumbs/svg?seed=ScuderiaJakarta',
  },
  {
    label: 'Netral F1 + anti false-positive ("gas" huruf kecil)',
    platform: 'youtube',
    author: 'PenontonSetia',
    message: 'Halo bang! Live-nya jernih banget, gas terus sampai finish!',
    avatar: 'https://api.dicebear.com/9.x/thumbs/svg?seed=PenontonSetia',
  },
  {
    label: 'Uji chat panjang (auto-clamp "...")',
    platform: 'tiktok',
    author: 'KomentatorSantai',
    message: 'Sainz dan Williams kelihatan kuat banget di trek lurus ini, kalau safety car keluar di lap 35 bisa banget undercut semua mobil di depan terus langsung naik ke posisi lima besar sampai garis finish tanpa harus pit lagi!',
  },
]

function parseArgs(argv) {
  const opts = { loop: false, intervalSec: 5, author: '', message: '', platform: 'tiktok', avatar: '', help: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--loop' || arg === '-l') opts.loop = true
    else if (arg === '--help' || arg === '-h') opts.help = true
    else if (arg === '--interval' || arg === '-i') opts.intervalSec = Math.max(0.5, Number(argv[++i]) || 5)
    else if (arg === '--author' || arg === '-a') opts.author = String(argv[++i] || '')
    else if (arg === '--message' || arg === '-m') opts.message = String(argv[++i] || '')
    else if (arg === '--platform' || arg === '-p') opts.platform = String(argv[++i] || 'tiktok')
    else if (arg === '--avatar') opts.avatar = String(argv[++i] || '')
  }
  return opts
}

async function sendChat(item) {
  const headers = { 'Content-Type': 'application/json' }
  if (SECRET) headers['X-Secret-Token'] = SECRET

  const res = await fetch(`${BASE_URL}/api/chat/dev-inject`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      platform: item.platform || 'tiktok',
      author: item.author,
      message: item.message,
      ...(item.avatar ? { avatar: item.avatar } : {}),
      ...(item.badges ? { badges: item.badges } : {}),
    }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${data?.message || res.statusText}`)
  }
  return data
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    console.log(`
Dummy Chat Sender untuk Preview OBS (LiveOverlay)

Pemakaian:
  bun run dummy-chat                                 Kirim 15 dummy chat F1 bergantian (jeda 5 detik)
  bun run dummy-chat -- --loop                       Ulang terus sampai Ctrl+C
  bun run dummy-chat -- --interval 3                 Ubah jeda antar chat (detik)
  bun run dummy-chat -- -a "Nama" -m "Isi chat"      Kirim 1 chat custom instan
  bun run dummy-chat -- -a "User" -m "Halo" -p youtube
`)
    return
  }

  // Mode 1 chat custom instan
  if (opts.message) {
    const item = {
      platform: opts.platform === 'youtube' ? 'youtube' : 'tiktok',
      author: opts.author || 'ViewerTest',
      message: opts.message,
      avatar: opts.avatar || undefined,
    }
    await sendChat(item)
    console.log(`✅ Terkirim [${item.platform}] ${item.author}: ${item.message}`)
    return
  }

  console.log(`🏎️  Mengirim dummy chat ke ${BASE_URL}/api/chat/dev-inject (jeda ${opts.intervalSec}s${opts.loop ? ', mode LOOP — Ctrl+C untuk berhenti' : ''})`)
  console.log('')

  let round = 1
  do {
    if (opts.loop) console.log(`--- Putaran #${round} ---`)
    for (let i = 0; i < DUMMY_CHATS.length; i++) {
      const chat = DUMMY_CHATS[i]
      try {
        await sendChat(chat)
        console.log(`[${i + 1}/${DUMMY_CHATS.length}] ✅ ${chat.label}`)
        console.log(`    ${chat.platform.toUpperCase()} | ${chat.author}: "${chat.message}"`)
      } catch (err) {
        console.error(`❌ Gagal kirim chat (${err.message}). Pastikan server LiveOverlay sedang berjalan di ${BASE_URL}!`)
        process.exit(1)
      }
      if (i < DUMMY_CHATS.length - 1 || opts.loop) {
        await sleep(opts.intervalSec * 1000)
      }
    }
    round++
  } while (opts.loop)

  console.log('\n🏁 Selesai mengirim semua dummy chat!')
}

main()
