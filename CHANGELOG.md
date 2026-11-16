# Changelog

Arsip historis pengembangan **LiveOverlay Studio**. Untuk status implementasi terkini & backlog, lihat [`issue.md`](./issue.md). Untuk visi produk & prinsip desain, lihat [`Vision.md`](./Vision.md).

---

## [Unreleased]

_(Belum ada perubahan setelah v1.2.0.)_

## [1.2.0] - 2026-11-16 - Multi-platform Chat & State Binding

### Multi-platform chat (C1-C7 complete)

#### C7 — Stress test, dokumentasi, rilis

- Added `tests/stress-chat.mjs`, an integrated stress test that drives ChatHub → NotifQueue → ChatArchive with 6 000 chats from both platforms. It simulates 10 minutes of virtual time as 120 bursts of 50 chats/second, and asserts:
  - all 6 000 chats reach the archive in order with no loss;
  - the server ring buffer stays bounded at 500;
  - the notification queue never exceeds `maxQueue` (20);
  - feed polling (`since`) keeps a reasonable latency (p95 under 50 ms; measured ~0.02 ms locally);
  - no crash or unhandled failure.
- Added `bun run test:stress`; the stress test is also part of `bun run test`.
- Updated `README.md` with multi-platform chat usage: how to bind **Chat Stack** and **Chat Notification**, how to animate notifications with State Binding `chatNotif`, where archives are stored (`chat-archive/YYYYMMDD-HHmmss.jsonl`), how to preview/download SRT/VTT/CSV/JSON from `/control`, and the dev-only `POST /api/chat/dev-inject` flow. Project structure, scripts, LAN/secret notes, and known limitations were refreshed.
- Updated `Vision.md` §3.3 to record that live chat is exposed through text binding (`chat`) while animated notifications use State Binding `chatNotif` (no separate animation system).
- Updated `issue.md` to mark C1–C7 complete and document the stress test coverage.
- Bumped `package.json` to **1.2.0** and added `platform-config.v1.bak.json` to `.gitignore` so migration backups never get committed.

#### C6 — Editor & /control UI

- Editor connector panel now shows **two independent blocks** (TikTok and YouTube), each with its own enable toggle, fields, status dot/label, and error line. YouTube also shows today's `quotaUnitsUsedToday` and a hint to fill `videoId` to save quota. Saving uses the v2 config shape (`tiktok`, `youtube`, `stats`, `notif`, `chatFormat`, `archive`) instead of the legacy single-platform payload.
- Added chat notification settings to the editor: `displayMs`, `gapMs` (documented as ≥ 300 ms and ideally ≥ the out-animation duration), `maxQueue`, plus editable TikTok/YouTube platform tags and the archive toggle. "Start Semua"/"Stop Semua" enable/disable both connectors in one click. Turning archive off (or stopping all connectors) now closes the active archive session per D4, and no chats are written while archive is off.
- Text Binding gained `source: 'chat'` with **Chat Stack** (`field: 'stack'`, `lines`, `template`) and **Chat Notification (Author + Message)** (`field: 'notif'`, `template`). Placeholders `{platformTag}`, `{platform}`, `{author}`, `{message}` use the shared `public/chat-format.js`; the editor polls `/api/chat/feed` every 1.5 s so both bindings preview live.
- Per D1, the platform dropdown now exposes only **Status/Viewers TikTok** and **Status/Viewers YouTube**. Deprecated fields (`username`, `followers`, `likes`, `latestChat*`, etc.) still render for old scenes and are inserted as a temporary "Lama" option instead of being silently lost. Per-platform status/viewers are read from the chat feed status, and `PlatformStatus` now carries `viewerCount`.
- State Binding source gained **Chat Notification** (`chatNotif`) with `idle` / `showing` states. The editor hides the unused group name, suggests both state names, and provides a one-click preset (`showing` opacity 1, `idle` opacity 0) so Enter/Transition can be configured immediately. Both states remain manually previewable in the canvas.
- `/control` got a standalone **Chat Archive** panel outside `#app`: session list with active/interrupted badges, active-session chat count and size, **End session**, export form (format, offset, mode, lines, ttl, tags), and a **samakan dengan chat** helper (pick a chat + video time → server `offsetSec` is written into the offset field). "Preview 3 cue" renders the first three cues/rows before download.
- Control-page secret handling now also retries archive **GET** requests on 401, not only POST/PUT/PATCH/DELETE, because archive GETs contain viewer usernames.
- Added dev-only `POST /api/chat/dev-inject` (`NODE_ENV !== 'production'` or `CHAT_DEV_INJECT=1`) accepting `{ platform, author, message }`. It feeds the same ChatHub → NotifQueue → archive pipeline as real connectors, for the C6 manual acceptance test.

#### C5 — Overlay: Chat Stack + Notification

- Overlay now polls the server-owned feed (`GET /api/chat/feed?since=&limit=`) every ±500 ms instead of keeping a local chat queue. The local buffer stores the last 50 chats and server sequence IDs keep ordering identical across multiple browser sources (portrait + landscape).
- New text binding `source: 'chat'`:
  - `field: 'stack'` renders the last N chats (default 5, clamped 1–30) oldest→newest joined with `\n`, so the newest line is at the bottom. Uses the same multiline render path as `f1data`.
  - `field: 'notif'` renders the current `NotifSnapshot` as a single `author: message` string (default template `{author}: {message}`).
  - Custom `template` supports `{platformTag}`, `{platform}`, `{author}`, `{message}`; formatting uses the shared `public/chat-format.js`. Platform tags are read from `chatFormat` in config v2 (`[TT]` / `[YT]` by default).
- New State Binding source `source: 'chatNotif'` with states `idle` / `showing`; `group` is unused. Animations still use the existing State Binding + Enter/Transition system — no new animation engine.
- Removed the old overlay-local queue (`chatDisplayQueue`, `tickChatDisplay`, `restartChatDisplayTimer`). Legacy `latestChatAuthor` / `latestChatMessage` bindings still work and now read the latest feed chat (fallback: notification snapshot → live stats).
- Feed application is coalesced through `requestAnimationFrame` so a 50 chats/second burst produces at most one render per frame, not one render per message.
- First feed load takes the tail for the stack but suppresses a snapshot that is already `showing`, so reloading OBS/browser source never replays an old notification; the next new chat (`seq` changes) shows normally.
- Scene normalization now preserves and lightly validates new bindings: `normalizeChatBindings()` in `src/scene-migration.ts` keeps `source: 'chat'` / `'chatNotif'` and clamps stack `lines` to 1–30 instead of dropping unknown sources.
- Tests added to `tests/overlay-state.test.mjs` (stack order/tags/default + custom template, notif `showing`→`idle`, legacy latest-chat fields, two overlays staying in sync, and reload suppression) and `tests/scene-migration.test.mjs` (chat bindings survive normalization).

#### C4 — Chat Archive & Export

- Implemented `ChatArchiveManager` (`src/chat-archive.ts`): append-only JSONL sessions in `chat-archive/`, one file per session named `YYYYMMDD-HHmmss.jsonl`. Each file opens with a `session` header line and closes with `session_end`.
- Flush is debounced (≥100 items **or** 1 s) and serialised via a promise chain to prevent concurrent `appendFile` calls from dropping messages during bursts.
- Tolerant line parser: corrupt or truncated lines (e.g., after a crash) are silently skipped when reading a session; `listSessions()` marks files without a `session_end` line as `interrupted: true`.
- Archive auto-starts when the first platform connector is enabled (via `schedulePlatformConnectors`) and flushes cleanly on SIGINT/SIGTERM.
- Export engine: SRT, VTT (HTML-escaped `& < >`), CSV (injection-protected: cells starting with `= + - @` get a `'` prefix), JSON — with **stack** mode (sweep over cue boundaries, min 300 ms cue duration) and **single** mode, configurable `ttl`, `lines`, `offset`, and `tags` filter.
- Video-sync alignment helper: given a `chatSeq` and a `videoTime` string (`[HH:]MM:SS[.mmm]`), returns `offsetSec` to align archive timestamps to video playback.
- `chat-archive/` added to `.gitignore`.
- New API endpoints (all archive GET endpoints guarded by `SETTINGS_SECRET`):
  - `GET /api/chat/archive` — list sessions with metadata
  - `POST /api/chat/archive/session/end` — end active session
  - `GET /api/chat/archive/:id/chats?limit=&offset=` — paginated chat lines
  - `GET /api/chat/archive/:id/align?chatSeq=&videoTime=` — alignment helper
  - `GET /api/chat/archive/:id/export?format=&offset=&mode=&lines=&ttl=&tags=` — download file (sets `Content-Disposition`)
- Acceptance criteria verified by test: 6 000 chats → exactly 6 000 lines in JSONL; SRT export timestamps are strictly ascending with no negative cues.

- Added a server-owned chat feed with bounded deduplication and monotonic sequence IDs; chat bursts no longer write `live-stats.json` per TikTok message (in-memory cached and debounced by >= 2s).
- Added the notification queue state machine (`idle`/`showing`), including a minimum 300 ms gap so state-bound animations can retrigger reliably.
- Added the v1-to-v2 platform-config migration foundation, retaining legacy TikTok/YouTube credentials and notification duration.
- Platform config files now migrate on first load: the original is retained as `platform-config.v1.bak.json`, while legacy API clients continue receiving their existing single-platform shape during the UI transition.
- Refactored TikTok connector into a modular class (`src/connectors/tiktok.ts`) with independent state, reconnection backoff, and direct forwarding to ChatHub.
- Implemented dedicated YouTube connector (`src/connectors/youtube.ts`) separating chat polling loop from stats poll loop; chat loop continuously obeys `pollingIntervalMillis`, uses pagination (`nextPageToken`), dedupes items, and tracks daily quota units used (`quotaUnitsUsedToday`), with 5-minute backoff on 403 quota errors without crashing.
- Introduced `ConnectorManager` (`src/connectors/manager.ts`) managing both connectors concurrently. TikTok and YouTube can be enabled simultaneously without conflict.
- Extended `/api/platform-connector/start` and `/api/platform-connector/stop` to accept optional `{ platform: 'tiktok' | 'youtube' }` for granular per-platform control while maintaining legacy backward-compatible behavior.

Model animasi dipisah antara **target visual per state** dan **timing perpindahan**.

- Elemen punya `stateBinding` (sumber: Event State atau Counter, plus `fallbackState`), `stateTargets` (target visual absolut per state), dan `animation.enter` / `animation.transition`.
- `animation.enter` dimainkan saat elemen pertama kali muncul; nilai `x`/`y` di sini adalah **offset relatif** terhadap target state. `animation.transition` hanya menyimpan timing/ease dan properti yang ikut bergerak; **nilai tujuannya dibaca dari target state baru**.
- Tiap target state bisa membawa `_direction` (`forward` / `reverse`) untuk urutan step transition saat masuk ke state itu, dan `_visible: false` supaya elemen benar-benar disembunyikan (`visibility: hidden`) **setelah** transition selesai. Masuk ke state tampil, elemen ditampilkan **sebelum** transition mulai supaya fade-in terlihat.
- Transition membunuh timeline enter/loop; loop dibangun ulang menuju target state baru (`buildLoopTimeline`, dengan reset baseline lebih dulu supaya `from` tidak beranimasi dari nilai beku).
- `visibilityBinding` dan `animation.exitSequence` **dihapus** dari model; digantikan state `hidden` + transition.

### Migrasi otomatis scene lama (`src/scene-migration.ts`)
Dijalankan di `normalizeScene()` setiap scene dibaca/disimpan. Idempoten, tidak mengubah input, dan hasilnya tertulis ke `scenes.json` saat scene berikutnya disimpan.

- `visibilityBinding` (eventState, atau counter dengan comparator `eq`) menjadi `stateBinding` + `stateTargets` (state cocok = opacity asli, `hidden` = opacity 0 + `_visible: false`). Nilai counter dibandingkan sebagai angka (`"05"` menjadi state `"5"`).
- `animation.exitSequence` menjadi `animation.transition` + target state `hidden`; urutan exit dimainkan **terbalik** saat kembali ke state tampil. Kalau exit tidak menyentuh opacity, ditambahkan step opacity instan supaya elemen bisa muncul lagi.
- `animation.sequence` / `loop` skema lama menjadi `animation.enter`. Nilai `x`/`y` yang dulu absolut kanvas dikonversi ke offset relatif (`x - el.x`), dan field `delay` per-step dipecah jadi step `delay` tersendiri.
- **Tidak ada data yang dibuang diam-diam.** `visibilityBinding` dengan comparator `neq` / `gt` / `gte` / `lt` / `lte` tidak bisa dipetakan ke state diskret: datanya (termasuk `exitSequence`-nya) **dipertahankan** di elemen dan diberi warning satu kali di log, tetapi tidak lagi dibaca overlay, jadi elemen itu selalu tampil sampai diatur ulang manual. Binding yang sudah nonaktif dibuang karena memang tidak punya efek.

Keterbatasan migrasi `exitSequence` (diberi warning di log): bila satu properti diubah di beberapa step, hanya nilai akhirnya yang dipakai sebagai target `hidden`; step bertipe `from` dan `repeat`/`yoyo` pada step exit tidak dibawa.

**Perubahan perilaku yang perlu diketahui**: dulu elemen dibuat ulang saat binding kembali true sehingga animasi *enter* diputar lagi. Sekarang enter hanya dimainkan saat elemen pertama muncul, dan kembali ke state tampil memainkan transition (terbalik dari exit).

### Pengujian
- `tests/animation-engine.test.mjs`: 44 assertion (transition, arah per state, loop setelah pindah state).
- `tests/overlay-state.test.mjs`: 13 tes integrasi `overlay.html` di jsdom — fallback state, visibilitas per state, arah transition, hidden manual, loop setelah transition, stack chat, notif `chatNotif`, field chat lama, dua overlay sinkron, dan reload tanpa notif lama.
- `tests/scene-migration.test.mjs`: 13 tes migrasi + normalisasi binding chat.
- Suite chat: `chat-hub`, `notif-queue`, `platform-config`, `tiktok-connector`, `youtube-connector`, `connector-manager`, dan `chat-archive` (termasuk 6 000 chat tanpa kehilangan).
- `tests/stress-chat.mjs` (C7): 6 000 chat dari dua platform dalam 10 menit virtual, burst 50 chat/detik; verifikasi arsip lengkap, ring buffer 500, `maxQueue`, dan latensi feed.
- `bun run test` menjalankan seluruh suite di atas. `overlay-state` memakai `node --test` karena jsdom gagal di runner Bun (`'addEventListener' called on an object that is not a valid instance of EventTarget`); script `test:overlay` dan `test:stress` tersedia untuk menjalankannya sendiri.

### UI Refactor & Design System Cleanup

- Menambahkan design tokens berdasarkan referensi desain lokal pribadi untuk warna Studio Canvas, Sage Olive, typography Manrope, dan shadow neumorphic; sumber kebenaran token di repo adalah `public/design.css`.
- Memisahkan styling editor ke `public/editor.css` dengan scope `.editor-page`.
- Memisahkan styling Control Panel ke scope `.control-page` di `public/design.css`.
- Mengurangi rebuild canvas saat mengubah warna/properti visual dengan `renderSelectedElement()`.
- Mengganti emoji UI utama dengan icon CSS mask pada Save Scene, Control Panel, duplicate, platform, dan kontrol editor.
- Memperbarui logo editor menggunakan `public/KerasnG.png` dengan background Studio Canvas.
- Menghapus tampilan Social Badge dan Banner dari UI, serta memindahkan akses upload asset ke baris Assets.
- Memperbarui preset Shape Box mengikuti palette dan surface baru.
- Menjaga indikator status Control Panel tetap hijau/merah agar tetap informatif.
- Regression check terakhir: 33 animation tests dan 4 control-state tests lulus.

Catatan stylesheet: `design.css` berisi token bersama dan styling Control Panel; `editor.css` berisi styling khusus editor; `styles.css` adalah hasil build Tailwind. `DESIGN.md` hanya referensi lokal pribadi dan tidak disimpan di repo; kontributor memakai `public/design.css` sebagai sumber kebenaran token.

### Chat notification review, notif dua baris, dan ikon platform

- `/control` mendapat panel **Chat Review** (di luar `#app`, hanya tampil kalau ada State Binding `chatNotif` yang enabled): tombol ▲/▼ menelusuri 100 notifikasi terakhir, badge **LIVE/REVIEW**, status posisi & antrean, dan antrean live otomatis dipause selama review. State review disimpan di server (`GET /api/chat/notif`, `POST /api/chat/notif/step`) supaya semua Browser Source OBS menampilkan notifikasi yang sama.
- Overlay memutar ulang animasi kemunculan elemen (`idle → showing`, atau enter animation kalau transition belum diatur) setiap kali review berpindah notifikasi, lalu loop di-resume seperti semula.
- Template **Chat Notification** default menjadi dua baris `{author}\n{message}` (author di atas, message di bawah). Template satu baris lama dimigrasi otomatis & idempoten di `normalizeChatBindings`; `\n` pada template dirender sebagai baris baru oleh `public/chat-format.js`.
- `{platformTag}` bisa diganti ikon file statis: letakkan `tiktok.*` / `youtube.*` di `public/chat-icons/` (deteksi berurutan `svg → png → webp → ico`). Tanpa file, otomatis kembali ke teks tag `[TT]`/`[YT]`. Ikon dirender inline lewat `ChatFormat.renderText()` di overlay dan preview editor; Running Text / Scroll Text memakai fallback teks tag (`ChatFormat.stripIcons()`). `GET /api/platform-connector` menyertakan `chatIcons` hasil `discoverChatIcons()`.
- Dokumentasi dirapikan: dokumen internal dipindah ke `docs/` (`docs/audit-2026-11-15.md`, `docs/plans/multi-platform-chat.md`) sehingga root repo hanya berisi dokumen kanonik.

### Audit hardening (`docs/audit-2026-11-15.md` temuan 1–18)

- Upload `/uploads/*` disajikan dengan `Content-Security-Policy: sandbox` + `X-Content-Type-Options: nosniff`, dan tipe file divalidasi lewat whitelist MIME/ekstensi (bukan dipercaya dari klien).
- Auth dipusatkan di satu `onBeforeHandle` untuk semua route POST/PUT/PATCH/DELETE; route GET arsip tetap memeriksa secret sendiri. Batas body global 12 MB, `POST /api/scenes` dibatasi 5 MB dan memakai skema `{ scene, originalId? }`.
- Penyimpanan scene dipindah ke `src/scene-store.ts`: tulis atomik (`writeFileAtomic`), cache parse berbasis mtime untuk polling overlay tiap 2 detik, dan `scenes.json` korup tidak pernah ditimpa (save/delete mengembalikan 409).
- `ChatArchiveManager` memvalidasi format ID sesi sebelum menyentuh file, meng-cache metadata sesi berdasarkan mtime/size, dan export stack memakai sliding window (bukan filter O(n²)).
- TikTok menyambung ulang setelah `STREAM_END` (backoff yang sudah ada), dan kedua connector menghentikan timer/koneksi lama saat config-nya dikosongkan.
- Koneksi SQLite F1 dibuka ulang saat mtime `f1gstats.sqlite` berubah, supaya hasil fetcher baru terbaca tanpa restart server.
- Route settings/konektor versi lama yang tidak dipakai dihapus, termasuk `settings.example.json`. `bun run test` sekarang menjalankan `tsc --noEmit` lebih dulu.
- Helper halaman bersama diekstrak ke `public/text-binding.js` (dipakai editor dan overlay). Test baru: `tests/scene-store.test.mjs`, `tests/text-binding.test.mjs`, plus test reconnect TikTok.

### Chat archive controls

- Endpoint baru: `POST /api/chat/archive/session/start` (tutup sesi aktif lalu mulai sesi baru) dan `DELETE /api/chat/archive/:id` (hapus sesi selesai; sesi aktif ditolak 400, ID divalidasi, traversal 404).
- `/control` → Chat Archive mendapat tombol **Sesi baru** dan **Hapus sesi**. `startSession()` menaikkan detik nama file kalau sesi baru dimulai di detik yang sama, jadi file sesi lama tidak pernah ditimpa/di-append.
- Daftar chat ikut dimuat ulang tiap polling 5 detik; saat sesi berganti, sesi lama dipertahankan satu siklus supaya chat yang telat masuk sempat tampil, baru berpindah ke sesi baru. Pilihan chat untuk alignment tidak hilang saat refresh.
- Panel Chat Archive hanya tampil (dan polling-nya hanya jalan) kalau ada **State Binding → Chat Notification** yang enabled di salah satu scene; visibility dicek ulang tiap 8 detik.
- Utility `.hidden` ditambahkan di Control Panel, sekaligus membetulkan tombol "End session aktif" yang sebelumnya tidak pernah benar-benar tersembunyi.

## [1.1.0] — Fase 10

### Fase 10.1 — Text Drop Shadow
✅ Selesai.

### Fase 10.2 — RotateX/Y/Z + Perspective
✅ Selesai.

### Fase 10.3 — Current Time
✅ Selesai.

### Fase 10.4 — Control Panel: Counter, Event State, Timer, Text
✅ Selesai. Halaman `/control`, endpoint `/api/control-state/*`, dan persistence `control-state.json` / `control-state.example.json`.

Perbaikan fase ini: mutasi control-state diserialkan dan dicache di memori, nama grup reserved dan nama lebih dari 64 karakter ditolak, file korup fallback ke state kosong, Restart/Resume timer diperbaiki, dan render display timer tidak mengganti tombol pada setiap tick.

## [1.0.0] — LiveOverlay Studio

Rilis pertama yang dianggap **visi tercapai** (lihat `Vision.md`): editor kanvas visual penuh, model animasi sequence generik, multi-scene/multi-output, data binding live (Platform Live Stats + F1GStats), asset management, dan parent-child grouping — semua terverifikasi jalan end-to-end.

### Fase 1 — Fondasi Kanvas & CRUD Elemen Dasar
✅ Selesai. Editor kanvas minimal: tambah elemen Text & Shape, drag posisi, resize, simpan/load Scene ke backend. Overlay renderer menampilkan hasil Scene (statis, tanpa animasi).

### Fase 2 — Panel Properti Lengkap
✅ Selesai. Panel edit properti detail: warna, font, ukuran presisi, opacity, rotasi, z-index/reorder layer.

### Fase 3 — Sistem Animasi (GSAP), model awal
✅ Selesai (kemudian di-overhaul total di Fase 8). Preset animasi masuk/idle/keluar per elemen.

### Fase 4 — Asset & SVG Import
✅ Selesai. Upload SVG/gambar (`POST /api/assets`, whitelist MIME, limit 10MB, sanitized filename) → grid thumbnail di editor → render `src`+`objectFit` identik di overlay. Verified end-to-end.

### Fase 5a — Platform Live Stats (TikTok/YouTube)
✅ Selesai lewat PR #19 (merged). TikTok via `tiktok-live-connector` (WebSocket real-time), YouTube via Data API v3 (REST polling). Semua field (Username, Display Name, Viewer Count, Follower Count, Like Count, Latest Chat Author, Latest Chat Message) terverifikasi lewat live testing di kedua platform. Termasuk Chat Display Queue System (durasi tampil chat independen dari poll interval, `chatDisplayDurationMs`) dan auto-reconnect exponential backoff.

### Fase 5b — External Data Source (Generic API Binding) — ❌ Dihapus
Awalnya diimplementasikan penuh (config CRUD, caching + in-flight dedupe, per-source poll interval/timeout, auto-discover field), lalu **dibatalkan dan kodenya dihapus sepenuhnya** dari `main`. Alasan: use case awal (data F1 real-time) tidak feasible dengan API gratis (butuh tier berbayar), dan sudah tergantikan sepenuhnya oleh F1GStats Integration (baca lokal SQLite, bukan hit API eksternal saat live).

**Yang dihapus** (backend, overlay, editor):
- Backend: endpoint `GET/POST /api/data-sources`, `GET /api/external-data`; fungsi `getExternalDataSources`, `saveExternalDataSources`, `normalizeExternalDataSourceConfig`, `refreshExternalDataSource`, `getExternalDataSnapshot`, `getValueAtPath`/`collectFieldPaths` versi backend; interface `ExternalDataSourceConfig`, `ExternalDataSourceCacheEntry`, `ExternalTextBinding`; konstanta dan file data source terkait (boleh dihapus manual dari disk kalau masih ada).
- Overlay: state `externalData`/`lastExternalDataHash`, fungsi `getExternalSourceSnapshot`, `syncExternalData`, cabang `binding.source === 'external'`.
- Editor: panel UI "External API Sources" — termasuk perbaikan struktur HTML karena panel ini membungkus section "Platform Live Stats Connector" dan "Layers List" di dalam div collapsible-nya (dipindah keluar). Juga dihapus opsi `external` di dropdown Binding Source, `external-binding-group`, dan semua state/fungsi/listener terkait.

**Dampak ke data lama**: scene dengan `textBinding.source === 'external'` tidak crash (fallback ke `fallback` text via guard di `resolveElementText`), tapi field khusus tidak ter-resolve lagi. Perlu dicek manual di `scenes.json` kalau ada binding lama semacam ini.

### Fase 6a — Multi-Scene & Multi-Output
✅ Selesai (PR #18, commit `e0bd7e9`). CRUD scene berbasis array (`GET/POST/DELETE /api/scenes`), scene selector + rename/duplicate/delete di editor, `?scene=`/`?id=` query param di overlay, Canvas Settings per-scene (width/height/background color, sebelumnya hardcode 1920×1080).

### Concurrent Rendering Multi-Scene — Tested, Finish
Technical debt "concurrent rendering 2+ browser source beda `?scene=`" sudah ditest dan dikonfirmasi **aman**.

### Fase 6b — Running Text (Adaptive Marquee)
✅ Selesai (fitur sisipan, branch `feat/running-text-marquee`, merge via PR). Kemampuan teks berjalan (ticker/marquee) dengan kecepatan konstan (px/detik) berapapun panjang teksnya.

**Data model**: `MarqueeConfig` (`enabled`, `speed`, `gap`, `direction`) di `SceneElement`, `src/index.ts`.

**Engine** (`public/overlay.html`):
- Ukur lebar teks pakai `canvas.measureText()` (bukan `offsetWidth`/`scrollWidth`) untuk hindari bug node-belum-attach ke DOM.
- Signature-guard sebelum rebuild tween, supaya tidak numpuk tween tiap render tick ~2 detik dari polling.
- Seamless loop: jumlah salinan teks dihitung dinamis (`Math.ceil(el.width / unit) + 2`) supaya container selalu penuh sepanjang animasi.
- Marquee berjalan untuk semua elemen yang `enabled`, bukan cuma yang overflow — keputusan final setelah iterasi (awalnya "cuma jalan kalau overflow", diubah karena user mau kontrol penuh via toggle).
- Cleanup `marqueeTween.kill()` saat elemen dihapus dari scene.

**Editor**: kontrol UI (toggle enable, speed, gap, direction) di panel Typography. Kanvas editor **tidak** menjalankan animasi kontinu (cuma badge statis "▶ Marquee · Npx/s") karena `renderCanvas()` rebuild total per-`mousemove`.

**Bug yang sempat muncul & fix** (referensi kalau ada regresi serupa):
- Track marquee sempat vertikal tidak center (`top:50%` tanpa `transform: translateY(-50%)`) → teks kepotong tengah. Fixed.
- 2-salinan tetap bikin animasi "glitch"/loncat saat teks pendek dipaksa selalu jalan → diganti jumlah salinan dinamis.

### Fase 6c — F1GStats Integration
✅ Selesai (fitur sisipan). Bind text elements ke data F1 (jadwal sesi + WDC/WCC standing) dari database SQLite lokal read-only, alternatif dari External Data Source (Fase 5b) yang butuh API berbayar.

**Arsitektur — 2 project terpisah**:
1. **F1GStats** (project Python terpisah, repo git sendiri) — `fetch_f1_data.py`, dijalankan manual (`py fetch_f1_data.py --season 2026 --output ./f1gstats.sqlite`) sebelum sesi live. Fetch dari FastF1 (`get_event_schedule`) + Ergast/Jolpica untuk standings, nama sirkuit, hasil race. Setiap run: `DELETE` lalu `INSERT` ulang (kondisi terkini, bukan akumulasi histori).
2. **LiveOverlay Studio** — baca file `.sqlite` read-only lewat `bun:sqlite` (bawaan Bun, tanpa dependency tambahan). Tidak pernah menulis balik.

Terhubung lewat 1 file `f1gstats.sqlite`, path diasumsikan sejajar folder LiveOverlay (`../F1GStats/f1gstats.sqlite`), override via env var `F1_DB_PATH`.

**Skema database** (4 tabel: `meta`, `sessions`, `driver_standings`, `constructor_standings`) — detail kolom di `src/index.ts` fungsi `getF1DataSnapshot()`.

**Filter Previous/Now/Next Round** — ditentukan `select_relevant_rounds()` di fetcher berdasarkan rentang weekend tiap round. Kolom `round_relation` (`'previous'|'now'|'next'`) ditulis fetcher, dipakai backend LiveOverlay untuk grouping stabil (bukan array index yang bisa geser).

**Custom Text Templates** (commit `0e16627`) — format tiap field text dibaca dari `f1-text-templates.json` (opsional, di-gitignore), reload otomatis kalau file berubah (cek `mtime`), tanpa restart server. Fallback graceful ke default hardcoded kalau file tidak ada/rusak. Placeholder tak dikenal sengaja dibiarkan apa adanya (bukan dihapus diam-diam) supaya user sadar ada typo. `TEAM_NAME_TO_ABBR` masih hardcoded di `src/index.ts` (jarang berubah).

**Fix whitespace separator custom** (commit `0e16627`) — `white-space: pre-line` collapse tab & spasi ganda jadi 1 spasi. Diganti `white-space: pre-wrap` + `tab-size: 4` di 3 tempat (`styleStaticText`/`createBlock` di overlay, `textP` di editor).

**Starting Grid actual (post-penalty) via OpenF1** — sebelumnya `starting_grid` murni dari Qualifying (Ergast), belum termasuk grid penalty. Ditambah `fetch_openf1_starting_grid()` (OpenF1 API) untuk grid actual; fallback otomatis ke Qualifying kalau OpenF1 404/kosong (endpoint beta/sparse, banyak sesi belum ada datanya sampai mendekati race day). Kolom `grid_source` (`'openf1'`/`'qualifying_fallback'`) untuk debugging, murni informatif.

**Country flag** disimpan sudah dalam bentuk emoji siap pakai (konversi di sisi fetcher Python). Fix (commit `6bf3c5d`): emoji sempat tidak ter-render karena font default gak punya glyph — `getFontStack()` sekarang otomatis menambahkan fallback `Noto Color Emoji`/`Segoe UI Emoji`/`Apple Color Emoji`.

**Catatan pengembangan**:
- Sempat ada error `table sessions has no column named round_relation` karena `CREATE TABLE IF NOT EXISTS` tidak migrate skema tabel yang sudah ada. Fixed dengan `_migrate_schema()` (cek `PRAGMA table_info`, `ALTER TABLE ADD COLUMN` idempotent).
- Index array `sessions.N` dalam satu round bisa geser tergantung format weekend (race biasa vs sprint weekend). Cek datalist auto-complete di editor, jangan asumsi index manual.

**Backend endpoint** `GET /api/f1-data`, snapshot: `season, lastFetchedAt, previousRound, nowRound, nextRound, driverStandings, constructorStandings, available, error`. `buildRoundGroup()` mengelompokkan raw session rows jadi 3 objek stabil.

**Overlay & Editor**: `resolveElementText`/`collectF1FieldPaths` generic (rekursif via `getValueAtPath`) — source binding `f1data` kompatibel tanpa logic tambahan, field path lewat auto-complete datalist. Poll interval 30 detik (data tidak perlu update selama live).

### Fase 6d — Scroll Text (Up/Down)
✅ Selesai (commit `1a2e280`). Varian vertikal dari Running Text — scroll ke atas/bawah. Mutually exclusive per elemen dengan Marquee (`scroll.enabled` prioritas di `applyElementContent`).

**Data model**: `ScrollConfig` (`enabled`, `speed`, `gap`, `direction: 'up'|'down'`, `yoyo`, `yoyoDelay`) di `SceneElement`.

**Engine** (`ensureScrollTrack`/`applyScrollText`) — dua mode:
- **Loop** (default): teks digandakan dinamis lalu scroll infinite via `gsap.fromTo`.
- **Yoyo**: 1 salinan teks, scroll dari posisi awal ke akhir lalu bolak-balik (`repeat:-1, yoyo:true`) dengan `repeatDelay: yoyoDelay`. Jarak scroll dihitung supaya seluruh teks ter-reveal (buffer tambahan untuk descender font).

Elemen pembungkus diberi `overflow: hidden` secara umum di `applyElementBox` (semua elemen, bukan cuma scroll) — **catatan efek samping**: bisa memotong drop shadow/glow elemen non-scroll yang melebihi box, belum diverifikasi ada regresi visual atau tidak.

**Editor**: panel "Scroll Text (Up / Down)" di Typography/Dynamic Content, sejajar Marquee. Kanvas editor tidak menjalankan animasi live (badge statis).

### Fase 7 — Polish UX Editor
Dipersempit ke Browser Source Auto-Sync (lihat `issue.md` bagian Technical Debt). Belum dimulai — snap-to-grid, alignment guide, keyboard shortcut, undo/redo dsb ditunda karena bukan bagian visi inti WYSIWYG.

### Fase 8 — Animation Sequence & Property Transition System (overhaul Fase 3)
✅ Selesai — branch `feature/animation-sequence-system`. Overhaul total sistem animasi: model `entrance/loop/exit` (3 slot preset tetap) → model sequence generik berbasis property-transition (`animation.sequence: []`, step Q0→Q1→Q2→...). Keputusan arsitektur settled di `Vision.md` §3.3.1. **Tidak ada backward-compat** untuk skema lama — migrasi langsung (project belum dipakai live saat itu, data scene murni testing).

**Breakdown fase kerja**:
- **Fase 0 — Modularisasi**: extract logic animasi jadi `animation-engine.js`, dipakai bersama editor & overlay (menjawab technical debt duplikasi logic).
- **Fase 1 — Migrasi skema data**: `SceneElement.animation.{entrance,loop,exit}` → `animation.sequence: AnimationStep[]` di `src/index.ts` + semua file contoh.
- **Fase 2 — Sequence Engine**: `AnimationController` + `buildTimelineFromSequence`. Step type `to` & `from`, properti `x`, `y`, `opacity`, `scale`, `rotation`. Posisi via `left`/`top`. Timeline registry per elementId + cleanup saat elemen dihapus/scene diganti/timeline infinite dihentikan eksplisit.
- **Fase 3 — Sequence Editor**: list step Q0..Qn (add/delete/reorder/duplicate), field per step, quick-insert preset (Fade In/Out, Slide Up In, Bounce In, Zoom In, Pulse loop, Float loop).
- **Fase 4 — Transform & Position Panel**: field x/y/scale/rotation/opacity current-state (termasuk slider Scale yang sebelumnya belum ada UI-nya) sebagai starting state eksplisit untuk step `to`/`from`.
- **Fase 5 — Reorganisasi panel**: Canvas Alignment, Typography (Running Text & Data Binding dipisah jadi "Dynamic Content"), Fill & Background, Border & Corners, Drop Shadow & Glow — semua jadi accordion. Urutan final: Canvas Alignment → Typography → Dynamic Content → Transform & Position → Animation Sequence → Image/SVG → Fill & Background → Borders & Corners → Drop Shadow & Glow.
- **Fase 6 — Sync overlay.html**: otomatis terpenuhi sejak Fase 0/2 (satu modul `animation-engine.js`).
- **Fase 7 — Testing**: 18/18 test otomatis lolos (sequential order, posisi akhir, multi-property simultan, delay, repeat finite & infinite+terminasi, scene replacement, error handling, loop flag). Belum diverifikasi: performa jangka panjang & multi-output nyata di OBS sungguhan.

**Keputusan pause/resume**: `AnimationController.pause()`/`resume()` dari spek awal **diputuskan tidak dibutuhkan** untuk use case saat ini — ditutup sebagai won't-do.

**Revisi pasca-Fase 7**: field `delay` yang nempel di tiap step (`{type:'to', ..., delay: 0.3}`) diganti jadi step tersendiri (`{type:'delay', duration:0.3}`), bisa disisipkan/dipindah/diduplikat/dihapus bebas, lewat tombol "⏱ Add Delay". Field `delay` lama `@deprecated` tapi tetap didukung baca: `AnimationEngine.splitLegacyPerStepDelay()` otomatis memecah data lama (termasuk di file contoh, sengaja tidak diubah sebagai bukti migrasi otomatis jalan) saat playback maupun pertama dibuka di editor.

### Fase 9 — Element Binding/Grouping (Parent-Child Transform)
✅ Selesai (commit `6395073`). Child mengikuti posisi **dan** animasi parent otomatis, tetap boleh punya `animation.sequence` sendiri (independen). Detail desain settled di `Vision.md` §3.3.2.

**Implementasi**:
- `SceneElement.parentId?: string | null` — kalau valid, `x`/`y` jadi relatif terhadap parent. Referensi invalid → fallback graceful ke top-level.
- Scope 1 level nesting (parent → child langsung) — referensi ke elemen yang parent-nya sendiri sudah terisi diabaikan.
- Render: child di-mount sebagai DOM descendant dari node parent (bukan container terpisah) — transform parent otomatis "membawa" child lewat containing-block CSS. Elemen berchild di-set `overflow: visible`.
- `overlay.html`: `renderScene()` dua-pass (top-level dulu, lalu child), guard reattach-DOM kalau parent sempat hilang/berubah.
- `index.html`: `renderCanvas()` direfactor rekursif (`buildAndMount`), logic sama persis dengan overlay. Drag & resize manual tidak perlu diubah (delta mouse generik terhadap frame referensi).
- UI: dropdown "Parent (Grouping)" di panel Transform & Position (enforce 1 level di level UI). `reparentElement()` auto-convert `x`/`y` saat assign/ganti/lepas parent supaya posisi visual tidak loncat.
- Layers panel: child ditandai indent + ikon `⤷` dengan tooltip nama parent.

**Belum tercakup**: assign parent lewat drag-and-drop langsung di Layers panel (sekarang cuma via dropdown) — nice-to-have kalau dropdown dirasa kurang natural.

### Automated Testing
`tests/animation-engine.test.mjs` — regression test permanen untuk `public/animation-engine.js`, jalan via `bun run test`. Simulasi browser via `jsdom` + GSAP asli (bukan mock, devDependency `gsap`+`jsdom`), tanpa perlu server/OBS. 25 assertion mencakup checklist spek awal (sequential execution, posisi, multi-property, repeat finite/infinite+terminasi, scene replacement, error handling, loop flag) + Delay-sebagai-step-tersendiri (termasuk migrasi otomatis data lama). Belum tercakup: testing UI/DOM penuh (baru unit-level ke engine). Pause/resume sengaja tidak diuji.
