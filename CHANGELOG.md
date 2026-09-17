# Changelog

Arsip historis pengembangan **LiveOverlay Studio**. Untuk status implementasi terkini & backlog, lihat [`issue.md`](./issue.md). Untuk visi produk & prinsip desain, lihat [`Vision.md`](./Vision.md).

---

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
- Backend: endpoint `GET/POST /api/data-sources`, `GET /api/external-data`; fungsi `getExternalDataSources`, `saveExternalDataSources`, `normalizeExternalDataSourceConfig`, `refreshExternalDataSource`, `getExternalDataSnapshot`, `getValueAtPath`/`collectFieldPaths` versi backend; interface `ExternalDataSourceConfig`, `ExternalDataSourceCacheEntry`, `ExternalTextBinding`; konstanta terkait; file `data-sources.json`/`data-sources.example.json` (boleh dihapus manual dari disk kalau masih ada).
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
