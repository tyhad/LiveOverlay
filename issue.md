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
| 5a | Platform Live Stats (TikTok/YouTube) | ⚠️ Belum clear — lihat detail di bawah |
| 5b | External Data Source (Generic API Binding) | ✅ Selesai (minor gap, lihat Technical Debt) |
| 6 | Multi-Scene & Multi-Output | ✅ Selesai (PR #18, commit `e0bd7e9`) |
| 7 | Polish UX Editor | Belum dimulai |

---

## Fase 5a — Platform Live Stats (Detail)

Branch: `feat/live-platform-connectors-fase-5a` (belum di-merge — draft PR, perlu revisi sebelum merge).

**Sudah benar:**
- YouTube connector: pakai YouTube Data API v3 resmi (search live broadcast → `videos.list` untuk viewer count → `liveChatMessages` untuk chat).
- Dead code `/api/settings` sudah dihapus.

**Perlu direvisi sebelum merge:**
1. **TikTok connector menyimpang dari rencana awal** — implementasi saat ini pakai REST polling sederhana ke `webcast.tiktok.com/webcast/room/info/` (bukan `TikTok-Live-Connector` / WebSocket push service yang sudah diriset). Konsekuensi: **tidak ada live chat TikTok** (cuma viewer count, like count, status live). Perlu diputuskan: lanjut pakai pendekatan simpel ini (trade-off: gak ada chat, tapi ringan, no extra dependency), atau ganti ke `TikTok-Live-Connector` sesuai riset awal supaya dapat chat real-time.
2. **Follower count belum diimplementasi** di kedua platform — field `followerCount` gak pernah di-set dari connector manapun.
3. **Potensi boros kuota YouTube** — kalau pakai Channel ID (bukan Video ID langsung), tiap polling cycle manggil `search.list` (100 unit/call) tanpa caching video ID yang ketemu. Bisa habis kuota harian (10.000 unit) dalam hitungan menit kalau poll interval terlalu pendek. Perlu cache video ID hasil resolve, refresh cuma kalau live berakhir.
4. **Belum ada retry/backoff saat error** — kalau API TikTok/YouTube gagal terus, polling tetap jalan di interval sama tanpa backoff.

---

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