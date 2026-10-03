# LiveOverlay Studio — Status Tracker

> Untuk visi produk, pilar fitur, arsitektur, dan prinsip desain, lihat [`Vision.md`](./Vision.md) — jarang berubah. Untuk riwayat lengkap tiap fase (keputusan desain, bug & fix, detail implementasi), lihat [`CHANGELOG.md`](./CHANGELOG.md). Dokumen ini fokus ke **backlog & technical debt aktif** — bagian yang masih perlu selalu up-to-date.

---

## Status Fase

**v1.1.0 — Visi v1.0 tercapai.** Semua pilar fitur inti di `Vision.md` §3 sudah selesai & terverifikasi. Detail lengkap tiap fase ada di [`CHANGELOG.md`](./CHANGELOG.md).

| Fase | Nama | Status |
|---|---|---|
| 1–4 | Fondasi Kanvas, Panel Properti, Animasi awal, Asset/SVG Import | ✅ Selesai |
| 5a | Platform Live Stats (TikTok/YouTube) | ✅ Selesai |
| 5b | External Data Source (Generic API Binding) | ❌ Dihapus (tergantikan F1GStats) |
| 6a–6d | Multi-Scene & Multi-Output, Running Text, F1GStats, Scroll Text | ✅ Selesai |
| 7 | Polish UX Editor | Belum dimulai — lihat Backlog di bawah |
| 8 | Animation Sequence & Property Transition System | ✅ Selesai |
| 9 | Element Binding/Grouping (Parent-Child) | ✅ Selesai |
| 10 | Text, 3D, Current Time, dan Control Panel | ✅ Selesai |
| 11 | State Binding & Animation Enter/Transition | ✅ Selesai (termasuk migrasi scene lama) |

---

## Fase 10 — Text, 3D, Current Time, dan Control Panel

- **10.1 Text Drop Shadow** — ✅ Selesai.
- **10.2 RotateX/Y/Z + Perspective** — ✅ Selesai.
- **10.3 Current Time** — ✅ Selesai.
- **10.4 Control Panel: Counter, Event State, Timer, Text** — ✅ Selesai. Halaman `/control`, endpoint `/api/control-state/*`, dan file `control-state.json` / `control-state.example.json`.
- Perbaikan 1–4: mutasi control-state diserialkan dan dicache di memori, nama grup reserved diblokir dan dibatasi 64 karakter, file korup fallback ke state kosong, Restart/Resume timer diperbaiki, dan re-render tombol saat timer berjalan dihentikan.

---

## Technical Debt

> ⚠️ **Race condition di `persistSceneStore()`** — dua `Bun.write()` berurutan tanpa lock; kalau dua save scene terjadi nyaris bersamaan berpotensi `scenes.json` sempat inkonsisten. Belum jadi masalah nyata di penggunaan saat ini, tapi diwaspadai kalau pola pemakaian berubah.

> ⚠️ **File `f1gstats.sqlite` bisa ter-lock** oleh proses lain (server LiveOverlay yang masih jalan) saat fetcher F1GStats coba overwrite file itu; di Windows ini gagal keras (`The process cannot access the file`). SOP manual: stop server LiveOverlay dulu sebelum re-run fetcher. Belum perlu jadi item kerja aktif.

- **Browser Source dimension tidak auto-sync ke Canvas Settings scene** — lihat detail di bagian Backlog.
- Marquee punya sedikit duplikasi kecil terpisah dari `animation-engine.js` (helper measure/text di overlay tidak dipakai di editor) — disengaja, editor cuma butuh badge statis, bukan bagian scope yang perlu dikerjakan.

### Automated Testing

`tests/animation-engine.test.mjs` — regression test permanen untuk `public/animation-engine.js`, jalan via `bun run test`. 44 assertion, simulasi browser via `jsdom` + GSAP asli.

`tests/overlay-state.test.mjs` — 7 tes integrasi `overlay.html` utuh di jsdom (fallback state, visibilitas per state, arah transition, hidden manual, loop setelah transition). **Jalan via `node --test`, bukan `bun test`**: jsdom gagal di runner Bun (`EventTarget` tidak valid), jadi `bun run test` memanggil Node untuk file ini (butuh Node.js terpasang). Bisa dijalankan sendiri dengan `bun run test:overlay`.

`tests/scene-migration.test.mjs` — 11 tes untuk `src/scene-migration.ts` (migrasi `visibilityBinding`, `exitSequence`, dan `animation.sequence` lama; idempoten; data yang tak bisa dimigrasi tidak dibuang).

`tests/control-state.test.mjs` — 4 tes untuk serialisasi mutasi, nama reserved, timer pause/resume/restart, dan persistence load/save.

**Belum tercakup**: testing UI/DOM penuh dan integrasi browser end-to-end. Detail cakupan di `CHANGELOG.md`.

---

## Backlog (Ide & Todo Berikutnya)

Belum masuk fase manapun — perlu didiskusikan & ditentukan skopnya sebelum dieksekusi.

### Fase 7 — Polish UX Editor
Snap-to-grid, alignment guide, keyboard shortcut, undo/redo, dsb. Kandidat item tambahan:
- Assign parent (grouping) lewat drag-and-drop langsung di Layers panel (sekarang cuma via dropdown).

### `visibilityBinding` dengan comparator non-`eq` belum punya padanan di State Binding
Scene lama yang memakai counter dengan `neq`/`gt`/`gte`/`lt`/`lte` tidak bisa dimigrasi otomatis (state bersifat diskret). Datanya **dipertahankan** di elemen (tidak hilang) tapi tidak lagi dibaca overlay, jadi elemen itu selalu tampil sampai diatur ulang manual lewat State Binding. Warning muncul sekali per elemen di log server (`[migrate] visibilityBinding ...`). Perlu keputusan: cukup dokumentasi manual, atau tambah dukungan rentang/comparator di State Binding.

### Migrasi `exitSequence` bersifat lossy
Exit lama dipetakan ke transition + target `hidden`. Kalau satu properti diubah di beberapa step exit, hanya nilai akhirnya yang dipakai; step `from` serta `repeat`/`yoyo` pada step exit tidak dibawa. Jalur kembali ke state tampil juga berbeda dari perilaku lama (transition terbalik, bukan enter diputar ulang). Detail di `CHANGELOG.md`.

### Browser Source dimension tidak auto-sync ke Canvas Settings scene
`scene.canvas.width/height` cuma ngatur ukuran artboard di dalam overlay — tidak otomatis mengubah ukuran window Browser Source di OBS/TikTok Studio. User harus set manual dimensi Browser Source (Properties) supaya sesuai scene (misal 1080×1920 untuk portrait). Untuk sekarang diakali manual. Kemungkinan penyebab teknis: `scaleViewport()`/CSS transform overlay belum proper handle aspect ratio non-landscape — belum diverifikasi.

### F1GStats — kemungkinan pengembangan lanjutan
- Auto-refresh terjadwal (cron/scheduled task) yang jalanin fetcher otomatis sebelum sesi live, biar tidak perlu diingat manual. Belum diprioritaskan — workflow manual saat ini masih ringan (1 command).
- Kalau ke depannya butuh histori multi-season (bukan cuma musim berjalan), perlu redesain skema (tambah kolom `season` eksplisit di tiap tabel, bukan cuma di `meta`).
- Starting grid actual masih bisa fallback ke Qualifying kalau fetch dilakukan jauh sebelum race day (OpenF1 belum publish). Opsi lanjutan: tambah sumber ketiga (scraping dokumen starting grid resmi FIA) — sengaja belum dikerjakan karena lebih berat/fragile dibanding manfaatnya saat ini.