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
| — | Running Text (Adaptive Marquee) — fitur sisipan | ✅ Selesai (PR merged via GitHub web) |
| — | F1GStats Integration — fitur sisipan | ✅ Selesai (PR merged via GitHub web) |
| 7 | Polish UX Editor | Belum dimulai |

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

**Overlay & Editor**: `resolveElementText`/`collectF1FieldPaths` sudah generic (rekursif via `getValueAtPath`) sejak Fase 5b, jadi source binding baru `f1data` otomatis kompatibel tanpa perlu logic tambahan — cukup daftar field path lewat auto-complete datalist di editor. Poll interval 30 detik (bukan 2 detik seperti live-stats) karena data ini tidak perlu update selama live.

**Country flag**: disimpan di database sudah dalam bentuk emoji siap pakai (bukan kode ISO mentah) — konversi dilakukan di sisi fetcher Python (`country_code_to_flag_emoji()` + mapping nama negara FastF1/Ergast → ISO alpha-2 di `COUNTRY_NAME_TO_ISO2`), bukan di LiveOverlay.

**Catatan pengembangan**:
- Sempat ada error `table sessions has no column named round_relation` saat nambah kolom baru ke skema — karena `CREATE TABLE IF NOT EXISTS` tidak migrate skema tabel yang sudah ada. Fixed dengan `_migrate_schema()` di fetcher yang cek `PRAGMA table_info` lalu `ALTER TABLE ADD COLUMN` kalau kolom belum ada — idempotent, aman dijalankan berkali-kali.
- Index array `sessions.N` dalam satu round **bisa geser** tergantung format weekend (race biasa 5 sesi: FP1/FP2/FP3/Quali/Race; sprint weekend format beda: FP1/Sprint Quali/Sprint/Quali/Race). Kalau butuh binding stabil ke sesi tertentu, cek urutan aktual lewat datalist auto-complete di editor, jangan asumsi index secara manual.

---

## Technical Debt (kandidat Fase 7)

- Concurrent rendering multi-scene (2+ browser source beda `?scene=` render bersamaan) belum di-test langsung. Desain kode kemungkinan besar aman (`getScenes()`/`getSceneById()` pure file-read), tapi belum diverifikasi eksplisit.
- Race condition di `persistSceneStore()`: dua `Bun.write()` berurutan tanpa lock — kalau dua save scene terjadi nyaris bersamaan, berpotensi `scenes.json` sempat inkonsisten.
- Config source Fase 5b masih via raw JSON textarea di editor, belum form UI per-field.
- Logic animasi GSAP ke-duplikat persis antara `overlay.html` dan `index.html`. Sekarang marquee juga menambah sedikit duplikasi kecil (helper measure/text di overlay tidak dipakai di editor, tapi ini disengaja karena editor cuma butuh badge statis).
- Google Fonts di-load all-upfront (7 keluarga font) padahal biasanya cuma 1-2 dipakai per scene. Font favorit user: **Manrope, Quicksand, Limelight** — pastikan 3 ini tetap tersedia/prioritas saat nanti diimplementasi lazy-load atau font picker yang lebih efisien.
- `gsap` di `package.json` sebagai dependency tapi gak kepake (yang dipakai versi CDN 3.12.5, padahal `package.json` declare `^3.15.0`).
- Browser Source dimension tidak auto-sync ke Canvas Settings scene — lihat detail di bawah.
- File `f1gstats.sqlite` bisa ter-lock oleh proses lain (misal server LiveOverlay yang masih jalan) saat fetcher F1GStats coba overwrite — di Windows ini gagal keras (`The process cannot access the file`), bukan cuma warning. Perlu SOP jelas: stop server LiveOverlay dulu sebelum re-run fetcher, atau ke depannya pertimbangkan skema "write ke file sementara lalu atomic rename" supaya tidak perlu stop service.

---

## Ide & Todo Berikutnya (belum masuk fase manapun)

### Element Binding/Grouping untuk Animasi
Kemampuan bind text/shape/element lain ke satu object "master" sehingga saat object master dianimasikan, element yang di-bind ikut bergerak/ter-animasi bersamaan (semacam grouping animasi, bukan cuma grouping visual statis). Perlu dipikirkan matang: model data-nya (parent-child transform vs shared animation trigger vs GSAP timeline linked), dan gimana ini berinteraksi dengan sistem `SceneElement` yang sudah ada (khususnya `animation` config per elemen). Kandidat masuk Fase 7 atau fase tambahan tersendiri.

### Browser Source dimension tidak auto-sync ke Canvas Settings scene
`scene.canvas.width/height` cuma ngatur ukuran artboard di dalam overlay — tidak otomatis mengubah ukuran window Browser Source di OBS/TikTok Studio. User harus set manual dimensi Browser Source (Properties) supaya sesuai scene (misal 1080×1920 untuk portrait), termasuk pastikan `?scene=` yang dipakai sudah benar. Untuk sekarang diakali manual (desain disesuaikan ke browser source). Kemungkinan penyebab teknis kalau mau digali: `scaleViewport()`/CSS transform overlay belum proper handle aspect ratio non-landscape — belum diverifikasi.

### F1GStats — kemungkinan pengembangan lanjutan
- Auto-refresh terjadwal (misal cron/scheduled task) yang jalanin fetcher otomatis di waktu tertentu sebelum sesi live, biar tidak perlu diingat manual tiap kali. Belum diprioritaskan karena workflow manual saat ini masih cukup ringan (1 command).
- Kalau ke depannya butuh histori multi-season (bukan cuma musim berjalan), perlu redesain skema (tambah kolom `season` eksplisit di tiap tabel, bukan cuma di `meta`).