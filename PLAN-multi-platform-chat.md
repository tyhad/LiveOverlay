# PLAN — Multi-Platform Chat, Chat Notification, Chat Stack, dan Arsip Chat

> Dokumen ini ditulis untuk **AI coding agent** yang mengeksekusi perubahan di repo `tyhad/LiveOverlay` (v1.1.0).
> Baca urut: §0 → §1 → §2, lalu kerjakan §5 fase demi fase. Setiap fase punya *acceptance criteria* dan harus lulus tes sebelum lanjut.
> Nomor baris di dokumen ini **perkiraan** dari commit `1af00e6`; cari ulang dengan `grep`, jangan percaya buta.

---

## 0. Aturan Main untuk Agent

1. Baca dulu `Vision.md` (prinsip settled), `issue.md` (technical debt), dan bagian terkait di `CHANGELOG.md`. Jangan langgar prinsip di `Vision.md` §3.3.1 dan §7.
2. Stack tetap: **Bun + Elysia + vanilla JS + GSAP**. Dilarang menambah framework frontend. Dependency baru hanya kalau benar-benar perlu dan harus disebut di PR.
3. Single-user, local-first. Jangan over-engineer ke arah SaaS.
4. **Backward compatible**: scene lama (`scenes.json`) dan `platform-config.json` lama harus tetap jalan tanpa edit manual. Tambahkan migrasi, jangan memaksa user mengulang desain.
5. Satu sumber kebenaran logic: kode yang dipakai bersama editor dan overlay (mis. formatter template chat) ditaruh di satu file di `public/` (pola seperti `animation-engine.js`), bukan disalin dua kali.
6. Tiap fase: tulis tes dulu atau bersamaan, jalankan `bun run test` hijau, update `CHANGELOG.md` dan `issue.md`.
7. Pesan chat berasal dari pihak ketiga → **tidak boleh** dirender lewat `innerHTML`. Wajib `textContent`. Cek jalur render teks di `overlay.html` (`styleStaticText` dan sekitarnya) dan pastikan aman.
8. Jangan menulis ulang file besar. `src/index.ts` (~2000 baris) boleh dipecah **hanya** untuk kode baru (modul baru di `src/`); jangan refactor kode lama yang tidak terkait.

---

## 1. Visi & Keputusan Produk (FINAL — hasil sesi grill dengan pemilik)

Pemilik adalah streamer yang live di **TikTok dan YouTube sekaligus** dan perlu:

| # | Kebutuhan | Keputusan |
|---|---|---|
| K1 | TikTok + YouTube jalan **bersamaan** | Dua connector independen, masing-masing punya enable/status sendiri. Tidak ada lagi pilihan "platform tunggal". |
| K2 | Data live stats | **Hanya chat yang digabung.** Field statistik lama tidak digabung/dijumlah. Pemilik hampir tidak memakai `username`, `displayName`, `viewerCount`, `followerCount`, `likeCount`, `platform name`; yang dipakai hanya **status live / error**. Lihat D1. |
| K3 | Chat bertumpuk (seperti live chat TikTok/YouTube) | Bukan elemen baru. Berupa **field text binding multiline**, seperti `f1data` multiline, yang update tiap chat masuk. N baris terakhir (bisa diatur), **terbaru di bawah**, lama terdorong keluar, tiap baris punya penanda platform `[TT]` / `[YT]`. TikTok+YouTube digabung urut waktu. |
| K4 | Author + message dalam satu field binding | Field baru yang menghasilkan satu string gabungan via template, default `{author}: {message}`. |
| K5 | Chat tampil seperti notifikasi (in → tahan → out) | Memakai **sistem yang sudah ada**: State Binding + Animation Enter/Transition. Ditambah sumber state virtual `chatNotif` dengan state `idle` / `showing`. **Tidak ada engine animasi baru.** Antrean dan durasi diatur server. Kalau tidak ada chat dalam durasi tampil → kembali `idle` (elemen disembunyikan oleh state target `idle`, mis. opacity 0). |
| K6 | Arsip chat (peak 6000 chat/sesi) | Simpan otomatis ke disk saat live (append-only JSONL). Bisa diekspor ke **SRT/VTT yang sinkron dengan rekaman video**, plus CSV dan JSON. |
| K7 | Sinkron waktu video | Patokan 0:00 = waktu sesi dimulai otomatis; pemilik menggeser dengan **offset detik** saat export. Ada helper "samakan dengan chat tertentu" supaya pemilik tidak perlu tahu jam mulai rekaman. |

### Keputusan default (agent boleh mengikuti; pemilik dapat mengubah)

- **D1 — Nasib field live stats lama.** Jangan dihapus dari skema (scene lama yang memakainya harus tetap render). Perlakuan: data tetap disimpan **per platform** (`stats.tiktok.*`, `stats.youtube.*`); di dropdown editor yang ditampilkan hanya: **Status TikTok**, **Status YouTube**, **Viewers TikTok**, **Viewers YouTube** (murah, sudah ada datanya). Field lain (username, displayName, followers, likes, platform name) **disembunyikan dari dropdown baru tapi tetap dibaca** untuk scene lama, ditandai deprecated. `GET /api/live-stats` tetap mengembalikan bentuk lama, diisi dari platform pertama yang aktif (prioritas TikTok).
- **D2 — Letak UI arsip.** Panel "Chat Archive" di halaman `/control` (dipakai saat live), bukan di editor.
- **D3 — Isi pesan.** TikTok: hanya event chat (bukan gift/like/join). YouTube: pesan teks; Super Chat disertakan sebagai teks pesan bila ada, event sistem diabaikan. Emote kustom **tidak** dirender sebagai gambar (teks saja) — di luar scope.
- **D4 — Siklus hidup sesi arsip.** Sesi dimulai saat connector pertama di-enable dan berakhir saat semua connector dimatikan oleh user atau tombol "End session" ditekan. Putus-sambung dan STREAM_END **tidak** mengakhiri sesi (dicatat sebagai baris `status`).
- **D5 — Buffer memori.** Ring buffer 500 chat terakhir di server; overlay menyimpan 50 terakhir.

---

## 2. Kondisi Kode Saat Ini (hasil audit)

Semua di `src/index.ts` kecuali disebut lain.

| Temuan | Lokasi (perkiraan) | Dampak |
|---|---|---|
| Satu config global: `PlatformConnectorConfig.platform: 'tiktok' \| 'youtube'`, satu `platformConnectorStatus` | tipe ±L40-60, `DEFAULT_PLATFORM_CONFIG` ±L1155 | Akar masalah K1. |
| `runPlatformConnectorOnce()` memanggil `stopTikTokConnector()` saat memilih YouTube, dan `schedulePlatformPoll()` serupa | ±L1620-1700 | Dua platform tidak bisa jalan bersamaan. |
| Setiap chat → `saveLiveStats()` yang **membaca + menulis ulang `live-stats.json`**, dan `chatMessages` dipotong `.slice(-25)` | `saveLiveStats` ±L1076, `normalizeLiveStats` ±L1022 | Tidak scalable di burst chat; pesan >25 hilang; tidak ada arsip. |
| TikTok: handler `WebcastEvent.CHAT` hanya memanggil `saveLiveStats({latestChatAuthor, latestChatMessage})` | `startTikTokConnector` ±L1402 | Perlu diarahkan ke ChatHub. |
| YouTube: polling `liveChat/messages` dengan `maxResults=25`, interval 10–300 detik (default 30) yang sama dengan polling statistik; `pollingIntervalMillis` dari API **diabaikan** | `fetchYouTubeStats` ±L1253-1380 | Di peak, pesan **pasti hilang** (25 pesan per 30 detik). Quota boros. |
| Overlay: `chatDisplayQueue` (MAX 15, sisanya dibuang), `tickChatDisplay()` mengganti `displayedChat` tiap `chatDisplayDurationMs`, `latestChatAuthor` dan `latestChatMessage` adalah dua field terpisah | `public/overlay.html` ±L915-975, ±L607-612 | Bukan notif in/out; author dan message tidak bisa digabung. Antrean ada di **tiap browser source** sehingga beberapa scene bisa tidak sinkron. |
| State Binding hanya mendukung `source: 'counter' \| 'eventState'` | `StateBinding` ±L267; `getElementActiveState` di `overlay.html` ±L690 | Perlu sumber baru `chatNotif`. |
| Overlay polling: live stats tiap 2 dtk, control state ±300–500 ms | `overlay.html` ±L1001-1065 | Pola yang akan dipakai ulang untuk feed chat. |
| Teks multiline sudah ada lewat binding `f1data` | `overlay.html` ±L595-620; `index.html` ±L766-830 | Pola yang ditiru untuk chat stack. |
| Dropdown field platform di editor | `public/index.html` ±L795-805 | Tempat menambah opsi binding baru. |

Fakta API YouTube yang dipakai (sudah diverifikasi di dokumentasi resmi): `liveChatMessages.list` berbiaya **5 unit quota per panggilan**, respons berisi `pollingIntervalMillis` yang **harus dipatuhi**, dan pesan lama sebelum panggilan awal tanpa token tidak diambil. Agent wajib mengecek dokumentasi terbaru untuk batas `maxResults` sebelum memilih nilainya.

---

## 3. Arsitektur Target

```
 TikTokConnector ─┐                                   ┌─> GET /api/chat/feed?since=<seq>   (overlay, polling ±500ms)
                  ├─> ChatHub ──┬─ ring buffer (500)  ├─> GET /api/chat/archive/...        (/control)
 YouTubeConnector ┘  (src/chat- │                     └─> GET /api/live-stats (legacy)
                      hub.ts)   ├─ NotifQueue (state machine idle/showing)
                                └─ ArchiveWriter (append JSONL, session aware)
```

Prinsip: **server adalah satu-satunya sumber kebenaran** untuk urutan chat dan antrean notif. Overlay hanya menampilkan. Dengan begitu beberapa browser source (portrait + landscape) selalu sinkron, dan reload OBS tidak mereset antrean.

### 3.1 Tipe data inti (`src/chat-types.ts`)

```ts
export type ChatPlatform = 'tiktok' | 'youtube'

export interface ChatEvent {
  seq: number            // naik monoton, diberikan ChatHub
  id: string             // id unik platform (dedupe). TikTok: msgId bila ada, fallback hash(platform+author+message+detik). YouTube: item.id
  platform: ChatPlatform
  author: string
  message: string
  ts: number             // epoch ms (waktu diterima server, atau publishedAt YouTube bila tersedia)
}

export interface NotifSnapshot {
  state: 'idle' | 'showing'
  seq: number            // seq chat yang sedang/terakhir ditampilkan
  author: string         // TETAP berisi nilai terakhir saat idle (supaya animasi out tidak kosong di tengah jalan)
  message: string
  platform: ChatPlatform | ''
  showUntil: number      // epoch ms, 0 saat idle
  queueLength: number
}

export interface PlatformStatus {
  enabled: boolean
  running: boolean       // tersambung dan sehat
  isLive: boolean
  lastError: string | null
  lastSuccessAt: string | null
  // khusus YouTube:
  quotaUnitsUsedToday?: number
}
```

### 3.2 Config baru (`platform-config.json`, dengan migrasi)

```jsonc
{
  "version": 2,
  "tiktok":  { "enabled": false, "username": "" },
  "youtube": { "enabled": false, "apiKey": "", "videoId": "", "channelId": "" },
  "stats":   { "pollIntervalMs": 30000 },          // statistik non-chat (viewers dll), bukan chat
  "notif":   { "displayMs": 4000, "gapMs": 600, "maxQueue": 20 },
  "chatFormat": { "tiktokTag": "[TT]", "youtubeTag": "[YT]" },
  "archive": { "enabled": true }
}
```

Migrasi dari skema lama (`enabled`, `platform`, `tiktokUsername`, `youtubeVideoId`, `youtubeChannelId`, `youtubeApiKey`, `pollIntervalMs`, `chatDisplayDurationMs`): jika file belum punya `version: 2`, petakan `platform` lama + `enabled` lama ke `tiktok.enabled` atau `youtube.enabled`, `chatDisplayDurationMs` → `notif.displayMs`, lalu tulis ulang (simpan salinan `platform-config.v1.bak.json`). Tulis tes migrasi.

---

## 4. Spesifikasi Perilaku

### 4.1 ChatHub (`src/chat-hub.ts`)

- `push(event)`: dedupe berdasarkan `(platform, id)` (set dengan batas ukuran, mis. 5000 id terakhir), beri `seq`, masukkan ke ring buffer, teruskan ke `NotifQueue` dan `ArchiveWriter`, update `latestChat*` untuk kompatibilitas `/api/live-stats`.
- Jangan menyentuh `live-stats.json` per pesan chat. Penulisan `live-stats.json` (statistik) di-debounce ≥ 2 detik.
- `since(seq, limit)`: kembalikan event dengan `seq > since`. Jika klien tertinggal melampaui buffer, kembalikan `resetRequired: true` + tail terbaru.
- Inject clock dan dependency (testable tanpa timer nyata).

### 4.2 NotifQueue (state machine, server-side)

```
idle ──(chat masuk & antrean tidak kosong)──> showing(item) ── displayMs ──> idle ── gapMs ──> [ada antrean? showing(next) : tetap idle]
```

- Gunakan `setTimeout` berantai, bukan `setInterval`.
- `gapMs` wajib ≥ 300 (clamp). Alasan: state harus berganti `showing → idle → showing` agar State Binding memicu ulang Enter/Transition; dan memberi waktu animasi out selesai. Dokumentasikan di UI: "gapMs sebaiknya ≥ durasi animasi out".
- Antrean > `maxQueue`: buang **yang terlama** (notifikasi harus terasa "baru"). Di peak 6000 chat, sebagian besar memang tidak akan jadi notif; itu perilaku yang diinginkan, arsip tetap menyimpan semuanya.
- Opsional adaptif (boleh ditunda): bila antrean ≥ 8, kurangi `displayMs` hingga minimum 1500 ms.
- Saat `idle`, `author/message/platform` terakhir **tidak dikosongkan**.
- Filter ringan: abaikan pesan kosong / hanya whitespace.
- Hasil akhir dibaca lewat `NotifSnapshot` di endpoint feed.

### 4.3 Connector

**TikTokConnector** — refactor dari `startTikTokConnector` jadi kelas/modul mandiri (`src/connectors/tiktok.ts`): state sendiri (conn, timer reconnect, backoff, flag disconnect), tidak berbagi variabel global dengan YouTube. Pertahankan perilaku reconnect eksponensial yang sudah ada. Event CHAT → `hub.push`. LIKE/ROOM_USER/STREAM_END → update `stats.tiktok` dan status (debounced).

**YouTubeConnector** (`src/connectors/youtube.ts`) — pisahkan dua loop:
1. **Loop chat**: panggil `liveChat/messages` dengan `pageToken` berkelanjutan; tunggu sesuai `pollingIntervalMillis` dari respons (jangan interval tetap 30 detik); `maxResults` dinaikkan ke nilai tinggi yang diizinkan (cek dokumentasi); jika `nextPageToken` ada dan respons penuh, ambil halaman berikutnya segera (hormati polling interval). Dedupe lewat `item.id`. Hitung `quotaUnitsUsedToday` (5 unit/panggilan chat, 1 unit `videos.list`, 100 unit `search.list`; reset tengah malam Pacific Time atau tampilkan "perkiraan sejak server start" bila ragu) dan tampilkan di status.
2. **Loop statistik** (viewers, status live): interval `stats.pollIntervalMs`, terpisah dari chat.
- `search.list` (100 unit) hanya dipakai bila `videoId` kosong, hasilnya di-cache; saat `liveChatId` error, coba re-resolve sekali dengan backoff — jangan dalam loop ketat. Di UI, sarankan mengisi `videoId` manual untuk menghemat quota.
- Error quota/403 → status error yang jelas + backoff panjang; jangan crash dan jangan menghentikan TikTok.

### 4.4 Binding baru di overlay

**Text binding** — tambah `source: 'chat'`:

```ts
interface ChatTextBinding {
  enabled?: boolean
  source: 'chat'
  field: 'stack' | 'notif'
  lines?: number          // khusus stack, default 5, rentang 1–30
  template?: string       // default stack: '{platformTag} {author}: {message}'; default notif: '{author}: {message}'
  prefix?: string
  suffix?: string
  fallback?: string
}
```

- Placeholder yang didukung: `{platformTag}`, `{platform}`, `{author}`, `{message}`. Formatter ini **satu file bersama** `public/chat-format.js` (dipakai editor dan overlay).
- `stack`: N chat terakhir dari buffer overlay, urut lama→baru, digabung `\n`, sehingga terbaru di bawah. Render lewat jalur multiline yang sama dengan `f1data` (agent: baca cara `f1data` multiline dirender dan pakai ulang, termasuk `white-space`).
- `notif`: satu string gabungan dari `NotifSnapshot` (`author` + `message`).
- Field lama `latestChatAuthor` / `latestChatMessage` tetap berfungsi (deprecated), kini mengambil dari snapshot notif / chat terbaru, tidak lagi dari antrean lokal overlay. **Hapus** `chatDisplayQueue`, `tickChatDisplay`, `restartChatDisplayTimer` dari `overlay.html` setelah digantikan.

**State binding** — perluas `StateBinding.source` menjadi `'counter' | 'eventState' | 'chatNotif'`. Untuk `chatNotif`, `group` tidak dipakai (isi konstanta `'notif'`), state aktif = `NotifSnapshot.state` (`'idle'` atau `'showing'`). Di `getElementActiveState` (overlay) dan padanannya di editor, tambahkan cabang ini. Pemilik mendesain: state target `showing` (opacity 1, posisi tampil) dan `idle` (opacity 0 / posisi keluar), lalu Enter/Transition sequence yang sudah ada. **Tidak ada animasi baru.**
- Pastikan `fallbackState` dan normalisasi "state tanpa target dianggap fallback" tetap bekerja.
- Validasi/normalisasi scene di server (`normalizeScene`, `scene-migration.ts`) harus menerima source baru tanpa membuangnya.

**Polling overlay**: satu `fetch('/api/chat/feed?since=<seq>')` tiap ±500 ms yang mengembalikan chat baru + `NotifSnapshot` + status platform. Render stack di-throttle (maks ~10 kali/detik, gabungkan burst lewat `requestAnimationFrame`) supaya burst 50 chat/detik tidak membuat re-render per pesan. Saat load pertama, ambil tail dan **jangan** memicu animasi/notif untuk chat lama.

### 4.5 Arsip (`src/chat-archive.ts`)

Lokasi: `chat-archive/` (env `CHAT_ARCHIVE_DIR` untuk override), masuk `.gitignore`.

Satu file per sesi: `YYYYMMDD-HHmmss.jsonl`, append-only. Format baris:

```jsonc
{"type":"session","v":1,"startedAt":"2026-10-29T14:02:11.000Z"}
{"type":"chat","seq":1,"id":"...","platform":"tiktok","author":"x","message":"halo","ts":1793000000123}
{"type":"status","platform":"youtube","event":"disconnected","ts":1793000100000,"detail":"..."}
{"type":"session_end","endedAt":"..."}
```

- Penulisan: buffer di memori, flush tiap 1 detik atau tiap ≥100 baris (append, **tidak** menulis ulang file). Flush saat `SIGINT`/`SIGTERM`/`beforeExit`. File tanpa `session_end` (crash) tetap valid dan ditampilkan sebagai "interrupted".
- Parser toleran: baris terakhir rusak/terpotong diabaikan, bukan menggagalkan seluruh file.
- Endpoint (lihat §6) untuk daftar sesi, end session, dan export.

**Export** (`format = srt | vtt | csv | json`), parameter: `offset` (detik, boleh negatif, default 0), `mode = stack | single` (default `stack`), `lines` (default 5), `ttl` (detik tampil per chat, default 8), `tags` (0/1, penanda `[TT]/[YT]`).
- Waktu relatif: `t = (ts - startedAt)/1000 + offset`. Cue dengan `t < 0` dipotong/dibuang.
- `single`: tiap chat satu cue `[t, t+ttl)`.
- `stack`: kumpulkan titik batas (waktu masuk tiap chat dan waktu kedaluwarsanya `t+ttl`); di setiap interval antar batas, teks cue = N chat aktif terakhir (lama→baru). Lewati interval kosong. Gabungkan cue berturut-turut yang teksnya identik. Durasi cue minimum 0.3 s untuk menghindari kedipan.
- Pesan: hapus newline, di VTT escape `&`, `<`, `>`. SRT: format `HH:MM:SS,mmm`; VTT: header `WEBVTT` dan `HH:MM:SS.mmm`.
- CSV kolom: `ts_iso, t_rel_sec, platform, author, message`; quoting benar dan **perlindungan CSV injection** (sel yang diawali `= + - @` diberi awalan `'`).
- **Helper sinkron** (K7): API/UI "samakan dengan chat": user memilih satu chat dari sesi dan mengetik menit:detik kemunculannya di video → server menghitung `offset = videoTime - (chat.ts - startedAt)/1000` dan mengembalikannya untuk dipakai export. Sediakan juga input offset manual.

### 4.6 UI

**Editor (`public/index.html`)**
- Panel Platform Connector: ganti pemilihan satu platform dengan **dua blok** (TikTok, YouTube), masing-masing toggle enable, field, dan indikator status sendiri. Tampilkan `quotaUnitsUsedToday` YouTube dan saran mengisi `videoId`.
- Dropdown Text Binding: tambah source "Chat" dengan field **Chat Stack** dan **Chat Notification (Author + Message)**, input `lines`, `template`. Opsi platform lama disederhanakan sesuai D1.
- State Binding: tambah source **Chat Notification** (states: `idle`, `showing`) dan pastikan editor mau menampilkan dua state itu di editor state target. Beri contoh preset singkat di UI/README: "Notifikasi Chat: showing = opacity 1, idle = opacity 0, Enter = slide+fade".
- Pengaturan notif (`displayMs`, `gapMs`, `maxQueue`) dan penanda platform.

**/control (`public/control.html`)**
- Panel "Chat Archive": daftar sesi, status sesi aktif (jumlah chat, ukuran), tombol **End session**, form export (format, offset, mode, lines, ttl) dan helper "samakan dengan chat". Preview 3 cue pertama sebelum mengunduh.

---

## 5. Fase Kerja

Tiap fase = satu PR kecil. Jangan mulai fase berikutnya sebelum acceptance criteria terpenuhi.

### Fase C0 — Baseline
- `bun install`, `bun run build`, `bun run test` (butuh Node ≥ 22.22.2 untuk tes jsdom). Catat hasil awal.
- Buat branch `feature/multi-chat`.
- **AC**: semua tes awal hijau; catat versi Bun/Node.

### Fase C1 — ChatHub + Feed API
- Buat `src/chat-types.ts`, `src/chat-hub.ts`, `src/chat-format.ts` (jika logic server perlu) dan `public/chat-format.js` (bersama).
- Endpoint `GET /api/chat/feed?since=&limit=` dan `GET /api/chat/status`.
- Rute lama `/api/live-stats` tetap ada; chat tidak lagi ditulis ke `live-stats.json` per pesan (debounce statistik).
- **Tes**: `tests/chat-hub.test.mjs` — dedupe, seq monoton, ring buffer batas 500, `since` normal dan `resetRequired`, tanpa menulis file per pesan.
- **AC**: mengirim 1000 event dummy ke hub tidak menyentuh disk per pesan; feed benar.

### Fase C2 — NotifQueue
- `src/notif-queue.ts` dengan clock injectable.
- **Tes**: `tests/notif-queue.test.mjs` — chat tunggal: idle→showing→idle; 5 chat beruntun: urutan dan gap benar; `maxQueue` membuang yang terlama; `gapMs` di-clamp ≥ 300; author/message dipertahankan saat idle; tidak ada chat → tetap idle.
- **AC**: semua tes hijau, tanpa `setTimeout` nyata di tes.

### Fase C3 — Pecah Connector + Config v2
- `src/connectors/tiktok.ts`, `src/connectors/youtube.ts`, `src/platform-config.ts` (load/save/migrasi v1→v2).
- Hapus pola "satu platform aktif" (`runPlatformConnectorOnce`/`schedulePlatformPoll` versi lama) dan ganti dengan manager yang mengelola kedua connector independen. Endpoint `/api/platform-connector` (GET/POST) dan `/start` `/stop` diperluas dengan parameter per platform; **pertahankan** respons lama sebisanya agar editor lama tidak patah selama transisi.
- YouTube: loop chat terpisah sesuai §4.3; hitung quota.
- **Tes**: tes migrasi config; tes YouTube loop dengan `fetch` palsu (menghormati `pollingIntervalMillis`, dedupe, pagination, error 403/quota tidak membunuh proses); tes TikTok dengan connection palsu (event CHAT masuk hub).
- **AC**: TikTok dan YouTube enabled bersamaan → chat dari keduanya muncul di `/api/chat/feed` urut waktu; mematikan satu tidak mengganggu yang lain.

### Fase C4 — Arsip
- `src/chat-archive.ts`, endpoint arsip & export (§6), tambah `chat-archive/` ke `.gitignore`.
- **Tes**: `tests/chat-archive.test.mjs` — append dan flush; file tanpa `session_end` terbaca; baris terakhir rusak diabaikan; export SRT/VTT format tepat (golden file); offset negatif; mode `stack` vs `single`; CSV injection; helper offset benar.
- **AC**: simulasi 6000 chat → file berisi tepat 6000 baris `chat`; export SRT valid (timestamp naik, tidak ada cue negatif).

### Fase C5 — Overlay: Stack + Notif
- `public/overlay.html`: polling feed, buffer lokal, binding `chat` (stack/notif), State Binding `chatNotif`, hapus antrean lokal lama, throttle render.
- Perluas tipe/validasi `SceneElement` di `src/index.ts` dan `scene-migration.ts` agar tidak membuang `source: 'chat'` / `'chatNotif'`.
- **Tes**: tambah ke `tests/overlay-state.test.mjs` (jsdom, jalan via `node --test`): stack N baris urut benar dan tag platform; notif state `showing`→`idle` mengubah state aktif elemen; scene lama dengan `latestChatAuthor/Message` tetap render; reload tidak memicu notif lama.
- **AC**: dua scene berbeda yang dibuka bersamaan menampilkan notif **pada saat yang sama**.

### Fase C6 — Editor & /control UI
- Implementasi §4.6.
- **AC (manual, jalankan app)**: buat scene dengan (1) teks Chat Stack 5 baris, (2) teks Chat Notification + shape latar dengan State Binding `chatNotif` (showing/idle) dan animasi Enter; kirim chat dummy lewat `POST /api/chat/dev-inject` (endpoint dev, hanya aktif bila `NODE_ENV !== 'production'` atau env `CHAT_DEV_INJECT=1`) dan konfirmasi perilaku.

### Fase C7 — Stress test, dokumentasi, rilis
- Skrip `tests/stress-chat.mjs`: simulasikan **6000 chat selama ±10 menit dengan burst 50 chat/detik** dari kedua platform. Assert: arsip lengkap (tidak ada kehilangan), memori ring buffer terbatas, latensi feed wajar, antrean notif tidak melebihi `maxQueue`, proses tidak crash.
- Update `README.md` (fitur, cara pakai notif & stack, cara export SRT), `CHANGELOG.md` (v1.2.0), `issue.md`, dan `Vision.md` §3.3 bila perlu (catat: "chat feed" dilakukan lewat text binding, notif lewat State Binding `chatNotif`).
- Tambah script tes baru ke `package.json`.

---

## 6. Spesifikasi API Baru

Semua `POST/PUT/PATCH/DELETE` tunduk pada `SETTINGS_SECRET` seperti endpoint lain. Agent: periksa mekanisme akses LAN (commit "amankan akses LAN dengan secret lokal") dan terapkan **juga** ke endpoint GET arsip karena berisi username penonton.

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/chat/feed?since=<seq>&limit=<n>` | `{ seq, items: ChatEvent[], resetRequired?: boolean, notif: NotifSnapshot, status: { tiktok: PlatformStatus, youtube: PlatformStatus } }` |
| GET | `/api/chat/status` | Status per platform saja (ringan). |
| GET/POST | `/api/platform-connector` | Config v2 + status; POST menerima sebagian config per platform. |
| POST | `/api/platform-connector/start` `/stop` | Body opsional `{ platform: 'tiktok' \| 'youtube' }`; tanpa body = keduanya. |
| GET | `/api/chat/archive` | Daftar sesi: `{ id, startedAt, endedAt?, interrupted, chatCount, bytes }`. |
| POST | `/api/chat/archive/session/end` | Akhiri sesi aktif. |
| GET | `/api/chat/archive/:id/chats?limit=&offset=` | Untuk helper "samakan dengan chat". |
| GET | `/api/chat/archive/:id/align?chatSeq=&videoTime=mm:ss` | Mengembalikan `{ offsetSec }`. |
| GET | `/api/chat/archive/:id/export?format=&offset=&mode=&lines=&ttl=&tags=` | File unduhan (`Content-Disposition`). |
| POST | `/api/chat/dev-inject` | Dev only: `{ platform, author, message }`. |

---

## 7. Risiko & Catatan

1. **`tiktok-live-connector` tidak resmi.** Bisa putus atau berubah tanpa pemberitahuan. Pertahankan backoff dan tampilkan status error yang jelas; jangan membuat YouTube ikut gagal.
2. **Quota YouTube.** Pakai `pollingIntervalMillis`, isi `videoId` manual bila bisa, tampilkan estimasi pemakaian. Opsi masa depan (di luar scope): `liveChatMessages.streamList` (gRPC streaming) untuk latensi dan quota lebih baik.
3. **Race condition tulis file** sudah tercatat di `issue.md` untuk `persistSceneStore`. Pola tulis arsip (append) tidak memperburuk itu; jangan memperkenalkan penulisan paralel ke file yang sama.
4. **Notif yang tidak "re-trigger".** Jika `gapMs` terlalu kecil, state tidak berganti dan animasi masuk tidak terulang. Itu sebabnya clamp ≥ 300 ms.
5. **Akurasi sinkron SRT.** Selalu bergantung pada offset. Dokumentasikan bahwa 0:00 = saat sesi arsip dimulai, bukan saat OBS mulai merekam.
6. **Di luar scope**: tombol "mark rekaman" di `/control` (ide lanjutan; bisa ditambahkan sebagai `marks[]` di meta sesi), render emote gambar, moderasi/filter kata, gift/like sebagai event, Twitch.

---

## 8. Definition of Done (keseluruhan)

- [ ] TikTok dan YouTube bisa aktif bersamaan, status masing-masing terlihat.
- [ ] Teks Chat Stack menampilkan N baris terakhir gabungan kedua platform dengan `[TT]/[YT]`, terbaru di bawah.
- [ ] Teks Chat Notification menampilkan `author: message` dalam satu binding, dan elemen animasi in/tahan/out lewat State Binding `chatNotif` memakai antrean dan durasi dari server; kembali hilang bila tidak ada chat.
- [ ] Semua chat tersimpan ke `chat-archive/*.jsonl`; stress test 6000 chat lolos tanpa kehilangan.
- [ ] Export SRT/VTT/CSV/JSON bekerja, dengan offset manual dan helper "samakan dengan chat".
- [ ] Scene lama dan `platform-config.json` lama tetap jalan (ada tes migrasi).
- [ ] `bun run test` hijau, dokumentasi dan changelog diperbarui.
