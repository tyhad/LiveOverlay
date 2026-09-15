# LiveOverlay Studio — Status Tracker

> Untuk visi produk, pilar fitur, arsitektur, dan prinsip desain, lihat [`VISION.md`](./VISION.md) — jarang berubah, gak perlu dibaca ulang tiap sesi kecuali ragu soal arah produk. Dokumen ini fokus ke **status implementasi terkini** yang perlu selalu up-to-date.

---

## Status Fase

| Fase | Nama | Status |
|---|---|---|
| 1 | Fondasi Kanvas & CRUD Elemen Dasar | ✅ Selesai |
| 2 | Panel Properti Lengkap | ✅ Selesai |
| 3 | Sistem Animasi (GSAP) | ✅ Selesai |
| 4 | Asset & SVG Import | ✅ Selesai |
| 5a | Platform Live Stats (TikTok/YouTube) | ✅ Selesai |
| 5b | External Data Source (Generic API Binding) | ❌ Dihapus — lihat "External Data Source — Dihapus" di bawah |
| 6 | Multi-Scene & Multi-Output | ✅ Selesai (PR #18, commit `e0bd7e9`) |
| — | Running Text (Adaptive Marquee) — fitur sisipan | ✅ Selesai (PR merged via GitHub web) |
| — | F1GStats Integration — fitur sisipan | ✅ Selesai (PR merged via GitHub web) |
| — | Scroll Text (Up/Down) — fitur sisipan | ✅ Selesai (commit `1a2e280`) |
| 8 | Animation Sequence & Property Transition System (overhaul Fase 3) | ✅ Selesai — branch `feature/animation-sequence-system` |
| 7 | Polish UX Editor — dipersempit ke Browser Source Auto-Sync (lihat Technical Debt) | Belum dimulai |
| 9 | Element Binding/Grouping (Parent-Child) — desain settled, lihat "Ide & Todo Berikutnya" | Belum dimulai |

---

## Fase 5a — Platform Live Stats (Selesai)

Diselesaikan lewat PR #19 (merged). TikTok connector via `tiktok-live-connector` (WebSocket real-time), YouTube via Data API v3 (REST polling). Semua field (Username, Display Name, Viewer Count, Follower Count, Like Count, Latest Chat Author, Latest Chat Message) terverifikasi bekerja dengan live testing beneran di kedua platform. Termasuk Chat Display Queue System (durasi tampil chat independen dari poll interval, dikonfigurasi lewat `chatDisplayDurationMs`) dan auto-reconnect dengan exponential backoff.

## Running Text (Adaptive Marquee) — Selesai

Fitur sisipan sebelum lanjut ke Fase 7, dikerjakan di branch `feat/running-text-marquee` lalu merge ke `main` via PR. Menambahkan kemampuan teks berjalan (ticker/marquee) pada elemen text, dengan kecepatan konstan (px/detik) berapapun panjang teksnya.

**Data model**: `MarqueeConfig` (`enabled`, `speed`, `gap`, `direction`) ditambahkan ke `SceneElement` di `src/index.ts`, sejajar `animation`/`textBinding`.

**Engine** (`public/overlay.html`):
- Ukur lebar teks pakai `canvas.measureText()` (bukan `offsetWidth`/`scrollWidth`) untuk hindari bug node-belum-attach ke DOM.
- Signature-guard sebelum rebuild tween, supaya tidak numpuk tween tiap render tick ~2 detik dari polling.
- Seamless loop: jumlah salinan teks dihitung dinamis (`Math.ceil(el.width / unit) + 2`) supaya container selalu penuh sepanjang animasi — bukan cuma 2 salinan tetap, biar tidak ada jeda/loncat saat reset loop, baik untuk teks pendek maupun panjang.
- **Marquee berjalan untuk semua elemen yang `enabled`, bukan cuma yang overflow** — ini keputusan final setelah iterasi (awalnya didesain "cuma jalan kalau overflow", diubah karena user mau kontrol penuh via toggle).
- Cleanup `marqueeTween.kill()` saat elemen dihapus dari scene, cegah tween "hantu".

**Editor** (`public/index.html`): kontrol UI (toggle enable, speed, gap, direction) di panel Typography. Kanvas editor **tidak** menjalankan animasi kontinu (cuma badge statis "▶ Marquee · Npx/s") karena `renderCanvas()` rebuild total per-`mousemove`, animasi persisten di situ pasti patah.

**Bug yang sempat muncul & fix selama development** (dicatat untuk referensi kalau ada regresi serupa):
- Track marquee sempat vertikal tidak center (`top:50%` tanpa `transform: translateY(-50%)`) → teks kepotong tengah secara height. Fixed.
- 2-salinan tetap bikin animasi terasa "glitch"/loncat saat teks pendek dipaksa selalu jalan → diganti jumlah salinan dinamis berbasis lebar container.

## F1GStats Integration — Selesai

Fitur sisipan lain sebelum Fase 7. Menambahkan kemampuan bind text elements ke data F1 (jadwal sesi + WDC/WCC standing) yang dibaca dari database SQLite lokal read-only, sebagai alternatif dari External Data Source (Fase 5b) yang butuh API berbayar untuk akses real-time saat live — F1 season data (schedule, standings) cukup di-prefetch manual sebelum streaming karena jarang berubah selama sesi live berlangsung.

**Arsitektur — 2 project terpisah**:
1. **F1GStats** (`C:\Users\Setyo\Python\F1GStats`, project Python terpisah, repo git sendiri) — script `fetch_f1_data.py`, dijalankan manual lewat command line (`py fetch_f1_data.py --season 2026 --output ./f1gstats.sqlite`) sebelum sesi live. Fetch dari FastF1 (`get_event_schedule`) + Ergast/Jolpica (`Ergast()` wrapper bawaan FastF1) untuk standings, nama sirkuit resmi, dan hasil race (dipakai hitung podium/DNF-DNS manual). Setiap run: `DELETE` isi tabel lalu `INSERT` ulang (bukan append) — representasi kondisi terkini, bukan akumulasi histori.
2. **LiveOverlay Studio** (project ini) — baca file `.sqlite` itu **read-only** lewat `bun:sqlite` (bawaan Bun, tanpa dependency tambahan). Tidak pernah menulis balik ke database itu.

Kedua project terhubung murni lewat 1 file `f1gstats.sqlite` yang path-nya diasumsikan sejajar folder LiveOverlay (`../F1GStats/f1gstats.sqlite`, bisa di-override via env var `F1_DB_PATH`).

**Skema database** (4 tabel: `meta`, `sessions`, `driver_standings`, `constructor_standings`) — lihat detail kolom di `src/index.ts` bagian `getF1DataSnapshot()`, atau brief asli fetcher untuk kontrak lengkap.

**Filter Previous/Now/Next Round** — hanya round yang relevan terhadap waktu prefetch yang di-load (bukan semua jadwal semusim), ditentukan `select_relevant_rounds()` di fetcher berdasarkan rentang weekend tiap round (`start_weekend` s/d `end_weekend`, dari sesi paling awal ke paling akhir):
- **Previous** = round terakhir yang weekend-nya sudah selesai sebelum waktu prefetch.
- **Now** = round yang weekend-nya sedang berlangsung saat prefetch (bisa `null` kalau prefetch dilakukan di luar masa race weekend mana pun).
- **Next** = round terdekat yang weekend-nya belum mulai.

Kolom `round_relation` (`'previous'|'now'|'next'`) di tabel `sessions` ditulis oleh fetcher berdasarkan hasil filter ini — dipakai backend LiveOverlay untuk grouping data jadi struktur stabil, **bukan** array index yang bisa geser posisi tergantung ada/tidaknya "Now".

**Backend** (`src/index.ts`): endpoint `GET /api/f1-data` return snapshot dalam bentuk:
```
{
  season, lastFetchedAt,
  previousRound: { round, raceName, circuitName, countryFlag, sessions: [{sessionType, startTimeUtc}] } | null,
  nowRound: (sama, bisa null),
  nextRound: (sama, bisa null),
  driverStandings: [{position, driverName, driverAbbr, teamName, points, wins, podiums, dnfDns}],
  constructorStandings: [{position, teamName, points, wins, podiums, dnfDns}],
  available, error
}
```
`buildRoundGroup()` mengelompokkan raw session rows (query `sessions` table) berdasarkan `roundRelation` jadi 3 objek stabil di atas.

**Overlay & Editor**: `resolveElementText`/`collectF1FieldPaths` generic (rekursif via `getValueAtPath`), jadi source binding `f1data` kompatibel tanpa perlu logic tambahan — cukup daftar field path lewat auto-complete datalist di editor. Poll interval 30 detik (bukan 2 detik seperti live-stats) karena data ini tidak perlu update selama live.

**Country flag**: disimpan di database sudah dalam bentuk emoji siap pakai (bukan kode ISO mentah) — konversi dilakukan di sisi fetcher Python (`country_code_to_flag_emoji()` + mapping nama negara FastF1/Ergast → ISO alpha-2 di `COUNTRY_NAME_TO_ISO2`), bukan di LiveOverlay. **Fix**: emoji bendera sempat tidak ter-render (font default gak punya glyph emoji) — sudah diperbaiki (commit `6bf3c5d`) lewat `getFontStack()` yang otomatis menambahkan fallback `Noto Color Emoji`/`Segoe UI Emoji`/`Apple Color Emoji` di belakang font family manapun yang dipilih user, plus load `Noto Color Emoji` dari Google Fonts.

**Catatan pengembangan**:
- Sempat ada error `table sessions has no column named round_relation` saat nambah kolom baru ke skema — karena `CREATE TABLE IF NOT EXISTS` tidak migrate skema tabel yang sudah ada. Fixed dengan `_migrate_schema()` di fetcher yang cek `PRAGMA table_info` lalu `ALTER TABLE ADD COLUMN` kalau kolom belum ada — idempotent, aman dijalankan berkali-kali.
- Index array `sessions.N` dalam satu round **bisa geser** tergantung format weekend (race biasa 5 sesi: FP1/FP2/FP3/Quali/Race; sprint weekend format beda: FP1/Sprint Quali/Sprint/Quali/Race). Kalau butuh binding stabil ke sesi tertentu, cek urutan aktual lewat datalist auto-complete di editor, jangan asumsi index secara manual.

## Scroll Text (Up/Down) — Selesai

Fitur sisipan lain (commit `1a2e280`), varian vertikal dari Running Text (Marquee) — teks scroll ke atas/bawah, bukan menyamping. Dua fitur ini **mutually exclusive per elemen**: kalau `scroll.enabled` aktif, engine mengabaikan `marquee` (dan sebaliknya) — prioritas ada di scroll saat render (`applyElementContent` cek `el.scroll?.enabled` duluan sebelum `el.marquee?.enabled`).

**Data model**: `ScrollConfig` (`enabled`, `speed`, `gap`, `direction: 'up'|'down'`, `yoyo`, `yoyoDelay`) ditambahkan ke `SceneElement` di `src/index.ts`, sejajar `marquee`/`animation`/`textBinding`.

**Engine** (`public/overlay.html`, fungsi `ensureScrollTrack`/`applyScrollText`) — dua mode:
- **Loop mode** (`yoyo: false`, default): teks digandakan berulang secara vertikal (jumlah salinan dihitung dinamis dari tinggi elemen, mirip prinsip Marquee) lalu di-scroll infinite ke arah `up`/`down` dengan kecepatan konstan (px/detik) via `gsap.fromTo`.
- **Yoyo mode** (`yoyo: true`): cuma 1 salinan teks, discroll dari posisi awal ke posisi akhir lalu **bolak-balik** (`repeat:-1, yoyo:true`) dengan jeda `repeatDelay: yoyoDelay` di tiap ujung. Kalau tinggi teks melebihi tinggi elemen, jarak scroll dihitung supaya seluruh teks ter-reveal (dengan buffer tambahan di bawah supaya baris terakhir/descender font gak terpotong); kalau teks lebih pendek dari elemen, cuma geser dalam ruang kosong yang tersedia.
- Elemen pembungkus (`node`) sekarang diberi `overflow: hidden` secara umum di `applyElementBox` (berlaku untuk semua elemen, bukan cuma yang scroll) supaya track/isi yang melebihi bounding box gak bocor visual keluar — **catatan efek samping**: ini juga mempengaruhi elemen non-scroll (misal drop shadow/glow yang melebihi box bisa ikut terpotong), belum diverifikasi ada regresi visual atau tidak di elemen lain.

**Editor** (`public/index.html`): panel baru "Scroll Text (Up / Down)" di area Typography/Dynamic Content, sejajar panel Marquee — kontrol Enable, Speed, Gap, Direction (`Bottom → Up` / `Top → Down`), Yoyo Mode toggle, Yoyo Delay. Sama seperti Marquee, kanvas editor **tidak** menjalankan animasi live (cuma badge statis "▶ Scroll ↑/↓ · Yoyo · Npx/s", posisinya digeser ke bawah kalau badge Marquee juga tampil).



Fitur ini **dibatalkan dan kodenya dihapus sepenuhnya** dari `main`. Alasan: use case awal (data balapan F1 real-time) tidak feasible dengan API gratis (butuh tier berbayar untuk akses live), dan sudah tergantikan sepenuhnya oleh F1GStats Integration (baca lokal SQLite, bukan hit API eksternal saat live).

**Yang dihapus** (backend, overlay, editor):
- Backend: endpoint `GET/POST /api/data-sources`, `GET /api/external-data`; fungsi `getExternalDataSources`, `saveExternalDataSources`, `normalizeExternalDataSourceConfig`, `refreshExternalDataSource`, `getExternalDataSnapshot`, `getValueAtPath`/`collectFieldPaths` (versi backend — versi client-side di overlay/editor tetap ada karena dipakai binding F1 data); interface `ExternalDataSourceConfig`, `ExternalDataSourceCacheEntry`, `ExternalTextBinding`; konstanta `DATA_SOURCES_FILE`, `EXAMPLE_DATA_SOURCES_FILE`, `DEFAULT_EXTERNAL_POLL_INTERVAL_MS`, `DEFAULT_EXTERNAL_TIMEOUT_MS`; file `data-sources.json`/`data-sources.example.json` sudah tidak dipakai (boleh dihapus manual dari disk kalau masih ada).
- Overlay (`overlay.html`): state `externalData`/`lastExternalDataHash`, fungsi `getExternalSourceSnapshot`, `syncExternalData`, cabang `binding.source === 'external'` di `resolveElementText`.
- Editor (`index.html`): panel UI "External API Sources" (textarea JSON, tombol save/refresh, toggle collapsible) — **termasuk perbaikan struktur HTML**, karena panel ini ternyata membungkus (wrap) section "Platform Live Stats Connector" dan "Layers List" di dalam div collapsible-nya; keduanya dipindah keluar supaya tidak ikut hilang saat panel External API Sources dihapus. Juga dihapus: opsi `external` di dropdown Binding Source, blok `external-binding-group`, state `externalData`, fungsi `loadDataSources`/`loadExternalData`/`saveDataSources`/`populateExternalSourceOptions`/`populateExternalFieldOptions`/`getExternalSourceSnapshot`, dan semua listener terkait.

**Dampak ke data lama**: kalau ada scene tersimpan dengan elemen `textBinding.source === 'external'`, elemen itu tidak akan crash (tetap fallback ke `fallback` text seperti biasa via guard yang sudah ada di `resolveElementText`), tapi field khusus itu tidak lagi ter-resolve. Perlu dicek manual di `scenes.json` kalau ada binding lama semacam ini dan diarahkan ulang ke `platform` atau `f1data`.

## Concurrent Rendering Multi-Scene — Tested, Finish

Item technical debt "concurrent rendering 2+ browser source beda `?scene=`" sudah ditest dan dikonfirmasi **aman**. Dipindahkan dari Technical Debt ke sini sebagai selesai/lulus verifikasi.

## Fase 8 — Animation Sequence & Property Transition System (Sedang Berjalan)

Overhaul total sistem animasi (dulu Fase 3), mengganti model `entrance/loop/exit` (3 slot preset tetap) menjadi model sequence generik berbasis property-transition (`animation.sequence: []`, step Q0→Q1→Q2→...). Keputusan arsitektur & prinsip yang sudah settled dicatat di `Vision.md` bagian 3.3.1. **Tidak ada backward-compat** untuk skema lama — migrasi langsung, karena project belum dipakai live dan data scene saat ini murni untuk testing.

**System yang wajib dipertahankan fungsinya selama overhaul ini** (tidak boleh regresi):
- Panel Add Elements, Assets, Platform Live Stats, Layers (~~catatan: tombol Bring to Top/Move Up/Move Down/Send to Bottom memang sudah rusak dari sebelumnya~~ ✅ **Fixed**), Canvas Settings, Running Text (Marquee), Data Binding, panel Multi-Scene & Multi-Output (~~catatan: teks header "LiveOverlay Studio"/"GSAP Animation" kepotong vertikal — bug CSS terpisah~~ ✅ **Fixed**).

Panel yang boleh ditata ulang menyesuaikan arsitektur baru: GSAP Animations Panel, Canvas Alignment Panel, Transform & Position Panel, Typography Panel (Running Text & Data Binding boleh dipisah jadi panel sendiri), Fill & Background, Border & Corners, Drop Shadow & Glow.

**Breakdown fase kerja** (checklist, dikerjakan bertahap — beberapa boleh paralel, dicatat di sub-poin):

- [x] **Fase 0 — Modularisasi**: extract logic animasi dari `index.html`/`overlay.html` jadi modul bersama (`animation-engine.js` atau setara) yang di-load oleh keduanya, supaya tidak ada duplikasi logic (menjawab technical debt "Logic animasi GSAP ke-duplikat" di bawah).
- [x] **Fase 1 — Migrasi skema data**: ganti `SceneElement.animation.{entrance,loop,exit}` → `animation.sequence: AnimationStep[]` di `src/index.ts` (tipe data) dan semua file contoh (`scene.example.json`, `scenes.example.json`).
- [x] **Fase 2 — Sequence Engine**: `AnimationController` + `buildTimelineFromSequence`. Step type `to` & `from` didukung, properti: `x`, `y`, `opacity`, `scale`, `rotation`. Posisi dianimasikan via `left`/`top`. Timeline registry per elementId + cleanup saat elemen dihapus/scene diganti/timeline infinite dihentikan eksplisit.
- [x] **Fase 3 — GSAP Animations Panel jadi Sequence Editor**: list step Q0..Qn (add/delete/reorder/duplicate), field per step, quick-insert preset (Fade In/Out, Slide Up In, Bounce In, Zoom In, Pulse loop, Float loop).
- [x] **Fase 4 — Transform & Position Panel**: field x/y/scale/rotation/opacity current-state elemen ditambah (termasuk slider Scale yang sebelumnya belum ada UI-nya sama sekali) sebagai starting state eksplisit untuk step `to`/`from`.
- [x] **Fase 5 — Reorganisasi panel non-animasi**: Canvas Alignment, Typography (Running Text & Data Binding dipisah jadi panel "Dynamic Content" sendiri), Fill & Background, Border & Corners, Drop Shadow & Glow — semua jadi accordion (`<details>`/`<summary>`) beserta 3 panel kiri (Add Elements, Assets, Platform Live Stats — Layers sengaja dikecualikan). Urutan final: Canvas Alignment → Typography → Dynamic Content → Transform & Position → Animation Sequence → Image/SVG → Fill & Background → Borders & Corners → Drop Shadow & Glow.
- [x] **Fase 6 — Sync `overlay.html`**: otomatis terpenuhi sejak Fase 0/2 (satu modul `animation-engine.js` dipakai bersama editor & overlay).
- [x] **Fase 7 — Testing**: 18/18 test otomatis lolos (sequential order, posisi akhir, multi-property simultan, delay, repeat finite & infinite+terminasi, scene replacement, error handling, loop flag). **Belum diverifikasi**: performa jangka panjang & multi-output nyata (perlu testing manual di OBS sungguhan). Pause/resume sengaja tidak masuk cakupan — lihat catatan di bawah.

**Keputusan pause/resume**: `AnimationController.pause()`/`resume()` yang disebut di dokumen spek awal (§16) tidak diimplementasikan, dan setelah dipertimbangkan **diputuskan tidak dibutuhkan** untuk use case saat ini — bukan lagi item terbuka/future-facing, ditutup sebagai won't-do.

**Revisi pasca-Fase 7**: field `delay` yang tadinya nempel di tiap step (`{type:'to', ..., delay: 0.3}`) diganti jadi **step khusus tersendiri** (`{type:'delay', duration:0.3}`) — bisa disisipkan/dipindah/diduplikat/dihapus bebas di posisi manapun dalam sequence, lewat tombol "⏱ Add Delay" di Sequence Editor. Field `delay` lama ditandai `@deprecated` di `src/index.ts` tapi tetap didukung baca: `AnimationEngine.splitLegacyPerStepDelay()` otomatis memecah data lama (termasuk yang ada di `scene.example.json`/`scenes.example.json`, sengaja **tidak diubah** supaya jadi bukti migrasi otomatis beneran jalan) jadi step delay tersendiri, baik saat playback maupun saat pertama dibuka di Sequence Editor (migrasi sticky lewat `ensureAnimation()`).

---

## Technical Debt (kandidat Fase 7)

> ⚠️ **Catatan (caution)**: Race condition di `persistSceneStore()` — dua `Bun.write()` berurutan tanpa lock, kalau dua save scene terjadi nyaris bersamaan berpotensi `scenes.json` sempat inkonsisten. Belum jadi masalah nyata di penggunaan saat ini, tapi diwaspadai kalau nanti pola pemakaian berubah.
- ~~Logic animasi GSAP ke-duplikat persis antara `overlay.html` dan `index.html`.~~ ✅ **Selesai** — tuntas lewat `public/animation-engine.js` yang dipakai bersama editor & overlay sejak Fase 8. Marquee tetap punya sedikit duplikasi kecil terpisah (helper measure/text di overlay tidak dipakai di editor, tapi ini disengaja karena editor cuma butuh badge statis) — bukan bagian dari scope ini, tidak perlu dikerjakan.
- ~~`gsap` di `package.json` sebagai dependency tapi gak kepake (yang dipakai versi CDN 3.12.5, padahal `package.json` declare `^3.15.0`).~~ Dicek ulang saat kerja Fase 8: catatan ini sudah **stale**, `gsap` sudah tidak ada sama sekali di `package.json`/`bun.lock` sebelum revisi ini (mungkin sempat dihapus tanpa update catatan). `gsap` sekarang ditambahkan kembali, tapi sebagai **devDependency** khusus untuk `tests/animation-engine.test.mjs` (lihat di bawah) — runtime produksi (`index.html`/`overlay.html`) tetap pakai versi CDN seperti sebelumnya, tidak berubah.
- Browser Source dimension tidak auto-sync ke Canvas Settings scene — lihat detail di bawah.

> ⚠️ **Catatan (caution)**: File `f1gstats.sqlite` bisa ter-lock oleh proses lain (misal server LiveOverlay yang masih jalan) saat fetcher F1GStats — project Python terpisah — coba overwrite file itu; di Windows ini gagal keras (`The process cannot access the file`), bukan cuma warning. Karena ini titik temu dua project terpisah, cukup diwaspadai lewat SOP manual: stop server LiveOverlay dulu sebelum re-run fetcher. Belum perlu jadi item kerja aktif di LiveOverlay Studio sendiri.

### Automated Testing

`tests/animation-engine.test.mjs` — regression test permanen untuk `public/animation-engine.js`, jalan pakai `bun run test`. Simulasi browser via `jsdom` + GSAP asli (bukan mock, devDependency `gsap`+`jsdom`), tanpa perlu server/OBS. Cakupan: 25 assertion mencakup checklist dokumen spek awal §25 (sequential execution, posisi, multi-property, repeat finite/infinite+terminasi, scene replacement, error handling, loop flag) + fitur Delay-sebagai-step-tersendiri (termasuk migrasi otomatis data lama). **Belum tercakup**: testing lewat UI/DOM penuh (baru unit-level ke engine-nya langsung; testing UI Sequence Editor masih manual). Pause/resume sengaja tidak diuji karena diputuskan tidak diimplementasikan (lihat catatan di atas).

---

## Ide & Todo Berikutnya (belum masuk fase manapun)

### Element Binding/Grouping untuk Animasi (Fase 9) — Desain Settled

**Keputusan model** (final, hasil diskusi): **Parent-Child Transform**. Child mengikuti posisi **dan** animasi parent secara otomatis — kalau parent object dipindah manual atau dianimasikan, semua child ikut bergerak/ter-animasi bersamaan tanpa perlu setup animasi sendiri di child. Child tetap boleh punya `animation.sequence` sendiri di atasnya (independen, contoh: parent geser posisi, child sekaligus punya bounce loop sendiri).

**Pendekatan teknis (arah implementasi)**:
- Tambah field baru `parentId: string | null` di `SceneElement` (`src/index.ts`).
- Saat elemen di-set jadi child (`parentId` terisi), `x`/`y` elemen tersebut berubah makna jadi **posisi relatif terhadap parent** (bukan lagi absolut terhadap kanvas) — supaya "ikut pindah" gak perlu recompute manual tiap parent gerak.
- Render (editor `index.html` & overlay `overlay.html`/`animation-engine.js`): bungkus parent + children dalam satu **DOM container** per grup. Transform (`left`/`top`/`scale`/`rotation`/`opacity`) dari animasi/posisi parent diterapkan ke container itu; child tetap punya elemen DOM sendiri di dalam container dengan offset relatifnya sendiri. Dengan begini, "child ikut animasi parent" otomatis kebawa dari CSS/DOM nesting, gak perlu duplikasi/sinkronisasi manual tween parent ke tiap child.
- Kalau child punya `animation.sequence` sendiri, tween itu jalan di elemen child di dalam container (independen dari tween container/parent) — jadi dua animasi (parent via container, child via elemen sendiri) jalan bersamaan tanpa konflik.
- Scope awal: **1 level nesting** (parent → child langsung), belum perlu grandchildren/nested group berlapis — biar gak over-engineer, sejalan prinsip di `Vision.md` §6 & §7. Bisa diperluas ke multi-level nanti kalau kebutuhannya muncul beneran.
- UI: cara assign child ke parent bisa lewat drag element ke atas elemen lain di Layers panel (indent = child), atau dropdown "Parent" di Transform & Position Panel — detail UX-nya masih perlu dipikirkan pas mulai Fase 9.
- Perlu dipikirkan juga: efek ke sistem align/snap yang sudah ada (apakah align tetap kerja relatif terhadap kanvas atau terhadap parent), dan efek ke drag manual di editor (drag child harus tetap terasa natural, bukan malah "loncat" karena representasi koordinat berubah jadi relatif).

Ini kandidat kerja berikutnya setelah Fase 7 (Browser Source Auto-Sync), atau bisa dikerjakan duluan kalau lebih prioritas — dua-duanya independen satu sama lain.

### Browser Source dimension tidak auto-sync ke Canvas Settings scene
`scene.canvas.width/height` cuma ngatur ukuran artboard di dalam overlay — tidak otomatis mengubah ukuran window Browser Source di OBS/TikTok Studio. User harus set manual dimensi Browser Source (Properties) supaya sesuai scene (misal 1080×1920 untuk portrait), termasuk pastikan `?scene=` yang dipakai sudah benar. Untuk sekarang diakali manual (desain disesuaikan ke browser source). Kemungkinan penyebab teknis kalau mau digali: `scaleViewport()`/CSS transform overlay belum proper handle aspect ratio non-landscape — belum diverifikasi.

### F1GStats — kemungkinan pengembangan lanjutan
- Auto-refresh terjadwal (misal cron/scheduled task) yang jalanin fetcher otomatis di waktu tertentu sebelum sesi live, biar tidak perlu diingat manual tiap kali. Belum diprioritaskan karena workflow manual saat ini masih cukup ringan (1 command).
- Kalau ke depannya butuh histori multi-season (bukan cuma musim berjalan), perlu redesain skema (tambah kolom `season` eksplisit di tiap tabel, bukan cuma di `meta`).