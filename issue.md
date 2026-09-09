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
| 5b | External Data Source (Generic API Binding) | ✅ Selesai (minor gap, lihat Technical Debt) |
| 6 | Multi-Scene & Multi-Output | ✅ Selesai (PR #18, commit `e0bd7e9`) |
| 7 | Polish UX Editor | Belum dimulai |

---

## Fase 5a — Platform Live Stats (Selesai)

Diselesaikan lewat PR #19 (merged). TikTok connector via `tiktok-live-connector` (WebSocket real-time), YouTube via Data API v3 (REST polling). Semua field (Username, Display Name, Viewer Count, Follower Count, Like Count, Latest Chat Author, Latest Chat Message) terverifikasi bekerja dengan live testing beneran di kedua platform. Termasuk Chat Display Queue System (durasi tampil chat independen dari poll interval, dikonfigurasi lewat `chatDisplayDurationMs`) dan auto-reconnect dengan exponential backoff.

## Technical Debt (kandidat Fase 7)

- Concurrent rendering multi-scene (2+ browser source beda `?scene=` render bersamaan) belum di-test langsung. Desain kode kemungkinan besar aman (`getScenes()`/`getSceneById()` pure file-read), tapi belum diverifikasi eksplisit.
- Race condition di `persistSceneStore()`: dua `Bun.write()` berurutan tanpa lock — kalau dua save scene terjadi nyaris bersamaan, berpotensi `scenes.json` sempat inkonsisten.
- Config source Fase 5b masih via raw JSON textarea di editor, belum form UI per-field.
- Logic animasi GSAP ke-duplikat persis antara `overlay.html` dan `index.html`.
- Google Fonts di-load all-upfront (7 keluarga font) padahal biasanya cuma 1-2 dipakai per scene. Font favorit user: **Manrope, Quicksand, Limelight** — pastikan 3 ini tetap tersedia/prioritas saat nanti diimplementasi lazy-load atau font picker yang lebih efisien.
- `gsap` di `package.json` sebagai dependency tapi gak kepake (yang dipakai versi CDN 3.12.5, padahal `package.json` declare `^3.15.0`).
- Browser Source dimension tidak auto-sync ke Canvas Settings scene — lihat detail di bawah.

---

## Ide & Todo Berikutnya (belum masuk fase manapun)

### Element Binding/Grouping untuk Animasi
Kemampuan bind text/shape/element lain ke satu object "master" sehingga saat object master dianimasikan, element yang di-bind ikut bergerak/ter-animasi bersamaan (semacam grouping animasi, bukan cuma grouping visual statis). Perlu dipikirkan matang: model data-nya (parent-child transform vs shared animation trigger vs GSAP timeline linked), dan gimana ini berinteraksi dengan sistem `SceneElement` yang sudah ada (khususnya `animation` config per elemen). Kandidat masuk Fase 7 atau fase tambahan tersendiri.

### Browser Source dimension tidak auto-sync ke Canvas Settings scene
`scene.canvas.width/height` cuma ngatur ukuran artboard di dalam overlay — tidak otomatis mengubah ukuran window Browser Source di OBS/TikTok Studio. User harus set manual dimensi Browser Source (Properties) supaya sesuai scene (misal 1080×1920 untuk portrait), termasuk pastikan `?scene=` yang dipakai sudah benar. Untuk sekarang diakali manual (desain disesuaikan ke browser source). Kemungkinan penyebab teknis kalau mau digali: `scaleViewport()`/CSS transform overlay belum proper handle aspect ratio non-landscape — belum diverifikasi.