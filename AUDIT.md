# Audit LiveOverlay Studio

**Tanggal:** 15 November 2026
**Scope:** seluruh repo (kode server, halaman publik, test, konfigurasi)
**Versi yang diaudit:** `package.json` v1.2.0, commit `eef387a`
**Status:** seluruh 18 temuan sudah diperbaiki (commit `980e011`); dokumen ini dipertahankan sebagai catatan audit.

Cara verifikasi cepat:

```bash
bun run test            # semua test lulus (exit 0, termasuk tsc --noEmit)
bunx tsc --noEmit       # bersih
```

---

## Apa yang dilakukan repo ini

LiveOverlay Studio adalah editor overlay live-streaming yang berjalan di browser. Streamer menyusun elemen
di kanvas, menyimpannya ke `scenes.json`, lalu OBS menampilkan `/overlay.html?scene=...`. Chat TikTok dan
YouTube masuk lewat server, ditampilkan sebagai stack/notifikasi, diarsipkan ke file JSONL, dan bisa
di-export sebagai subtitle.

**Beban yang diasumsikan saat audit:** satu streamer, satu server Bun di PC yang sama dengan OBS, 1–3
Browser Source, satu tab editor, mungkin satu HP di LAN untuk `/control`. Bukan multi-tenant, bukan
internet publik. Semua path di bawah relatif terhadap root repo.

---

## Must fix

### 1. `scenes.json` yang bukan array dihapus tanpa peringatan

`src/index.ts:950-990`

- **Apa ini:** `readSceneStore()` membaca file scene. Kalau isinya bukan array, ia menganggap file itu
  tidak ada, lalu `getScenes()` menulis scene kosong ke file yang sama.
- **Masalah:** File berisi `{}` (hasil edit tangan, backup lama, atau file yang setengah tertulis)
  dianggap "tidak ada file". `GET /api/scenes` berikutnya menimpanya dengan satu scene kosong. Semua
  scene hilang tanpa error.
- **Perbaikan:** di baris 966-972, kembalikan `scenesFileCorrupt: true` (seperti cabang `catch` di
  atasnya). Satu baris; `saveScene`/`deleteScene` sudah menolak menulis saat corrupt.
- **Kalau dilewati:** satu file salah format = seluruh desain overlay hilang, tanpa backup otomatis.

### 2. ID sesi arsip dipakai langsung sebagai nama file

`src/chat-archive.ts:255-267`, dipanggil dari `src/index.ts:1379,1393,1411`

- **Apa ini:** `GET /api/chat/archive/:id/...` meneruskan `:id` ke `join(baseDir, `${id}.jsonl`)` tanpa
  validasi.
- **Masalah:** `GET /api/chat/archive/..%2F..%2Fsession/chats` membaca file `.jsonl` di luar folder arsip
  (path traversal). ID itu juga masuk ke header `Content-Disposition` (`src/index.ts:1427`), jadi karakter
  kontrol bisa merusak response. Hanya butuh `HOST=0.0.0.0` tanpa secret, dan README sendiri mendorong
  setup LAN itu.
- **Perbaikan:** satu baris di awal `readSessionLines`:
  `if (!/^\d{8}-\d{6}$/.test(sessionId)) throw new Error('Session not found')`. Semua pemanggil sudah
  menangkap error tersebut.
- **Kalau dilewati:** user LAN bisa membaca file `.jsonl` mana pun di disk, termasuk arsip chat berisi
  username penonton.

### 3. TikTok tidak pernah menyambung lagi setelah stream selesai

`src/connectors/tiktok.ts:104-117`

- **Apa ini:** event `STREAM_END` menandai koneksi sebagai "disconnect sengaja", lalu `DISCONNECTED`
  memakai tanda itu untuk tidak reconnect.
- **Masalah:** Streamer mengakhiri live, server tetap jalan (pola normal: `bun run dev` dibiarkan hidup).
  Live berikutnya konektor tidak pernah mencoba lagi — `enabled` masih `true`, `running` masih `false`,
  dan overlay menampilkan "tidak live" sampai tombol Simpan/Start ditekan.
- **Perbaikan:** di handler `STREAM_END`, panggil `this.scheduleReconnect()` (backoff sudah dibatasi 5
  menit). Satu baris.
- **Kalau dilewati:** setiap stream setelah yang pertama butuh klik manual, dan kalau lupa, overlay diam
  sepanjang live.

### 4. Semua penulisan file langsung, tidak atomik

`src/index.ts:980` (scene), `src/index.ts:1174` (control state), `src/index.ts:1157` (live stats)

- **Apa ini:** `Bun.write(file, json)` memotong file dulu, baru menulis isi.
- **Masalah:** Server mati listrik atau di-kill di tengah tulis → `scenes.json` / `control-state.json`
  terpotong. `scenes.json` rusak membuat semua simpan ditolak (409) sampai diperbaiki manual.
  `control-state.json` rusak diam-diam di-reset ke kosong di `ControlStateStore.getState()`
  (`src/control-state.ts:121-125`), lalu file rusak itu ditimpa.
- **Perbaikan:** tulis ke `file.tmp` lalu `rename()` (atomik di filesystem yang sama). Tiga tempat, satu
  helper 4 baris.
- **Kalau dilewati:** kehilangan semua scene atau semua nilai counter/text karena crash, tanpa backup.

---

## Should fix

### 5. Config kosong meninggalkan koneksi lama tetap jalan

`src/connectors/tiktok.ts:48-56`, `src/connectors/youtube.ts:91-109`

- **Apa ini:** `start()` dengan username/API key kosong langsung `return` setelah mengeset status error.
- **Masalah:** Hapus username TikTok lalu Simpan: UI bilang "username is required" dan `running=false`,
  tapi koneksi lama masih hidup dan chat masih masuk + ditulis ke arsip. YouTube sama: timer poll lama
  tetap jalan dengan key lama.
- **Perbaikan:** panggil `this.stopConnectionOnly()` (TikTok) / `this.stopTimers()` (YouTube) sebelum
  `return` di cabang error. Dua baris.
- **Kalau dilewati:** status yang ditampilkan bohong, dan chat stream lama tetap terekam.

### 6. Daftar arsip membaca ulang semua file tiap 5 detik

`src/chat-archive.ts:219-253`, `public/control.html:1264`

- **Apa ini:** `GET /api/chat/archive` memanggil `listSessions()`, yang membuka, membaca, dan
  `JSON.parse` setiap baris dari setiap file sesi hanya untuk menghitung chat.
- **Masalah:** Setelah beberapa bulan (satu file per sesi, misal 100 sesi × 3.000 chat), tiap poll 5 detik
  mem-parse ~300 ribu baris di thread tunggal server. Overlay ikut tersendat karena semua route berbagi
  thread itu.
- **Perbaikan:** cache `{id, chatCount, endedAt, mtimeMs}` per file dan hanya parse ulang kalau
  `mtime`/`size` berubah (~10 baris), atau simpan jumlah chat di baris `session_end`.
- **Kalau dilewati:** `/control` makin lambat seiring bertambahnya riwayat, dan makin sering nge-lag saat
  live.

### 7. Export subtitle mode stack O(n²)

`src/chat-archive.ts:454-469`

- **Apa ini:** untuk tiap titik waktu, ia mem-filter seluruh daftar chat untuk mencari yang sedang tampil.
- **Masalah:** 6.000 chat (ukuran yang dites) = ~72 juta pengecekan; 20.000 chat (stream 2 jam yang
  ramai) = ~800 juta, memblokir thread server beberapa detik. Semua overlay freeze selama itu.
- **Perbaikan:** satu pointer yang bergerak (sliding window) di chat yang sudah diurutkan, bukan `filter`
  per interval. Sekitar 10 baris menggantikan 6.
- **Kalau dilewati:** tombol export di sesi panjang bisa menggantung overlay saat live.

### 8. Satu sesi arsip bisa mencakup beberapa stream

`src/index.ts:1279-1292`

- **Apa ini:** sesi arsip dimulai saat config pertama kali mengaktifkan konektor, dan hanya ditutup saat
  semua konektor dimatikan atau arsip di-off.
- **Masalah:** Stream berakhir (`STREAM_END`) tapi `enabled` tetap `true`, jadi sesi tetap terbuka. Live
  besoknya menyambung lagi → chat hari ini masuk ke file kemarin. `calculateAlignment` memakai `startedAt`
  kemarin, jadi semua offset subtitle untuk stream kedua meleset puluhan jam.
- **Perbaikan:** di `onStatsUpdate`, kalau `stats.isLive === false` dan platform lain juga tidak live,
  panggil `chatArchive.endSession()`. Sekitar 4 baris.
- **Kalau dilewati:** export subtitle untuk stream kedua salah waktu, dan file arsip mencampur dua acara.

### 9. Pengecekan secret ditulis ulang 9 kali

`src/index.ts:1455-1462,1516-1523,1557-1564,1784-1791,1828-1835,1850-1857,1893-1900,1919-1926`, plus satu
di `1360`

- **Apa ini:** `onBeforeHandle` di baris 1304-1313 sudah memeriksa header untuk semua
  POST/PUT/PATCH/DELETE. Delapan handler tetap mengulang blok yang sama.
- **Masalah:** Dua sumber kebenaran untuk satu aturan. Route baru yang lupa menyalin blok itu tetap aman
  (hook menangkapnya), tapi route yang menyalinnya salah akan lolos review — dan 70 baris itu harus
  dibaca dan diubah dua kali.
- **Perbaikan:** hapus 8 blok inline; sisakan hook dan cek GET `/api/chat/archive*` (baris 1360 dan
  turunannya) karena GET tidak dicakup hook.
- **Kalau dilewati:** perubahan aturan auth harus menyentuh 9 tempat; satu yang terlewat = lubang.

### 10. Seluruh lapisan route dan penyimpanan tidak punya test

`src/index.ts`, `tests/`

- **Apa ini:** 12 file test menutup engine animasi, migrasi scene, chat hub, notif, arsip, konektor, dan
  control state. `src/index.ts` (1.818 baris: auth, upload, tulis scene, semua route) tidak punya satu pun.
- **Masalah:** Bug nomor 1 (data loss) ada persis di fungsi yang tidak dites. Tidak ada test yang akan
  gagal saat `readSceneStore` berubah perilaku.
- **Perbaikan:** pindahkan `readSceneStore`/`persistSceneStore`/`saveScene` ke modul sendiri (pola yang
  sudah dipakai `control-state.ts`), lalu tes dengan direktori sementara: file tidak ada, JSON rusak, JSON
  bukan array, dua scene. Satu file test.
- **Kalau dilewati:** setiap perubahan penyimpanan scene hanya diverifikasi dengan mata, padahal itu tempat
  data user tinggal.

### 11. Dua belas fungsi disalin di editor dan overlay

`public/index.html:1911-2320`, `public/overlay.html:109-940`, `public/control.html:781-790`

- **Apa ini:** `formatBoundValue`, `formatClockTime`, `resolveElementText`, `getElementActiveState`,
  `getElementStateTarget`, `computeTimerDisplayMs`, `formatTimerMs`, `getFontStack`, `getValueAtPath`,
  `getEffectiveParentId`, `getEffectiveTextColor`, `getSceneCanvasSize` ada dua kali dengan isi identik
  (`formatBoundValue` sama byte demi byte). Matematika timer malah tiga kali.
- **Masalah:** Menambah satu token jam (misalnya detik) berarti mengedit `index.html` dan `overlay.html`.
  Lupa satu → preview editor beda dengan OBS, yang merusak janji WYSIWYG. `control.html` bisa menghitung
  sisa waktu berbeda dari overlay.
- **Perbaikan:** pindahkan ke `public/text-binding.js` seperti `chat-format.js` dan `animation-engine.js`
  yang sudah ada, muat di ketiga halaman. Kira-kira −250 baris.
- **Kalau dilewati:** setiap perubahan format teks/timer berisiko membuat overlay dan editor tidak sinkron.

### 12. Kode settings lama tidak dipakai

`src/index.ts:17-20,52-55,868-906`

- **Apa ini:** `Settings`, `DEFAULT_SETTINGS`, `getSettings`, `saveSettings`, `SETTINGS_FILE`,
  `EXAMPLE_SETTINGS_FILE`.
- **Masalah:** `GET/POST /api/settings` sudah dihapus (komentar di baris 1440). Grep seluruh repo: tidak
  ada pemanggil lain. `getSettings` hanya dipanggil `saveSettings`, dan `saveSettings` tidak dipanggil
  siapa pun.
- **Perbaikan:** hapus keenam item. −45 baris. `settings.example.json` juga bisa dihapus dari repo.
- **Kalau dilewati:** pembaca berikutnya mengira masih ada jalur settings dan mungkin "memperbaiki"-nya.

### 13. API konektor versi lama tidak punya pemanggil

`src/index.ts:1220-1245,1266-1277,1513-1591`

- **Apa ini:** `savePlatformConfig`, `legacyConnectorStatus`, `PlatformConnectorConfig`,
  `PlatformConnectorStatus`, dan dua route `POST /api/platform-connector/start|stop`. Komentarnya bilang
  untuk "editor lama" yang masih satu-toggle.
- **Masalah:** Editor yang diserve server ini sudah mengirim `tiktok`/`youtube` dan membaca
  `configV2`/`statusV2` (`public/index.html:4767,4842,4863`). Grep seluruh repo: tidak ada klien yang
  memanggil `/start` atau `/stop`. Jadi cabang "legacy" itu hanya bisa dicapai oleh klien yang tidak ada.
  Isinya juga menyimpan config dua kali berurutan (`savePlatformConfigFile` di baris 1224 lalu 1240).
- **Perbaikan:** hapus dua route dan tiga helper; `toLegacyPlatformConfig` hanya perlu dipertahankan kalau
  field `config` di response masih dipakai (tidak — editor membaca `configV2`). −110 baris.
- **Kalau dilewati:** 110 baris yang harus dibaca dan dijaga, dengan dua jalur tulis config yang bisa
  berbeda hasil.

---

## Nice to have

### 14. Overlay membaca dan menormalkan ulang `scenes.json` 30 kali per menit

`src/index.ts:950-997`, `public/overlay.html:1227`

- **Apa ini:** `GET /api/scenes/:id` membaca file, `JSON.parse`, dan menjalankan migrasi per elemen.
  Overlay memanggilnya tiap 2 detik, per Browser Source. `/control` menambah satu tiap 8 detik.
- **Masalah:** Tiga Browser Source = 90 parse + ratusan objek baru per menit, hanya untuk tahu isinya tidak
  berubah.
- **Perbaikan:** cache hasil parse dengan kunci `mtimeMs` di `readSceneStore` (3 baris).
  `persistSceneStore` meng-update cache.
- **Kalau dilewati:** kerja sia-sia yang tumbuh seiring jumlah scene dan elemen; belum terasa sekarang.

### 15. Upload percaya tipe MIME dari klien

`src/index.ts:1800-1813`

- **Apa ini:** ekstensi diambil dari `File.type` yang dikirim browser, isi file tidak diperiksa.
- **Masalah:** File SVG berisi `<script>` diunggah dengan `type: image/svg+xml` akan disajikan dari origin
  yang sama. Kalau streamer membuka `/uploads/....svg` langsung, script itu bisa memanggil API tulis.
- **Perbaikan:** kirim `Content-Security-Policy: sandbox` (atau `X-Content-Type-Options: nosniff` +
  `Content-Disposition: attachment`) untuk `/uploads/*` lewat satu hook. 3 baris.
- **Kalau dilewati:** butuh dua langkah dari penyerang (upload + korban membuka URL), tapi hasilnya sesi
  tanpa secret bisa dibajak.

### 16. `POST /api/scenes` tanpa skema dan tanpa batas ukuran

`src/index.ts:1890-1915`

- **Apa ini:** Satu-satunya route tulis besar yang tidak punya `body: t.Object(...)`; isi apa pun langsung
  dinormalkan dan ditulis.
- **Masalah:** Body 100 MB (atau `scene.elements` berisi string raksasa) diparse ke memori lalu ditulis ke
  disk. Di LAN tanpa secret, siapa pun bisa melakukannya.
- **Perbaikan:** tambahkan `t.Object({ scene: t.Any(), originalId: t.Optional(t.String()) })` plus batas
  ukuran body di Elysia. 4 baris.
- **Kalau dilewati:** satu request besar bisa membuat server kehabisan memori saat live.

### 17. Koneksi SQLite F1 dibuka sekali dan tidak pernah dibuka ulang

`src/index.ts:752-766`

- **Apa ini:** `getF1Db()` menyimpan handle `readonly` selamanya; `f1DbInitError` juga disimpan selamanya.
- **Masalah:** Kalau fetcher F1 mengganti file database (tulis file baru lalu rename) saat server hidup,
  handle lama menunjuk file lama → klasemen dan jadwal basi sampai server di-restart. Kalau file belum ada
  saat start, error-nya juga menetap.
- **Perbaikan:** simpan `mtimeMs` file, buka ulang handle kalau berubah (5 baris).
- **Kalau dilewati:** overlay menampilkan data F1 dari sesi sebelumnya dan tidak ada tanda apa pun.

### 18. Typecheck gagal dan tidak pernah dijalankan

`src/chat-archive.ts:60-62,459-468`, `package.json:13`

- **Apa ini:** `bunx tsc --noEmit` menghasilkan 13 error (indeks array yang mungkin `undefined` di bawah
  `noUncheckedIndexedAccess`). `bun run test` tidak memanggil `tsc`.
- **Masalah:** Konfigurasi `strict` tidak pernah ditegakkan, jadi kesalahan tipe baru tidak ketahuan sampai
  runtime. Sekarang pun repo tidak dalam keadaan bersih, jadi menambahkan typecheck ke CI akan langsung
  merah.
- **Perbaikan:** perbaiki 13 indeks itu (atau matikan `noUncheckedIndexedAccess`), lalu tambahkan
  `tsc --noEmit` di awal script `test`.
- **Kalau dilewati:** bug tipe baru lolos seperti bug tipe lama.

---

## Keputusan yang bukan temuan

Hal berikut sudah dicatat sebagai batasan sadar, jadi tidak dihitung sebagai temuan:

- Race condition `persistSceneStore()` saat dua simpan hampir bersamaan — diketahui, pemakaian single
  editor. Lihat `issue.md` dan README bagian Known Limitations.
- Duplikasi marquee kecil antara `overlay.html` dan `animation-engine.js` — disengaja (editor hanya butuh
  badge statis).
- `visibilityBinding` dengan comparator non-`eq` tidak bisa dimigrasi — data dipertahankan, ada warning.
- Migrasi `exitSequence` bersifat lossy — didokumentasikan di `issue.md`.
- File `f1gstats.sqlite` bisa ter-lock saat fetcher jalan — SOP: stop server dulu.

---

## Verdict

Arsitekturnya sehat dan test-nya nyata, tapi perbaiki dulu 4 hal: jangan hapus `scenes.json` yang formatnya
tidak dikenal, validasi ID sesi arsip, buat TikTok bisa reconnect sendiri, dan tulis file secara atomik.

**Lean: −220 baris, −0 dependency.** (8 blok auth duplikat ~70, settings mati ~45, API konektor lama ~110,
12 fungsi klien duplikat ~250 — sebagian tumpang tindih dengan perbaikan di atas.)

## Yang tidak diperiksa

- `public/index.html` (4.565 baris) hanya dibaca bagian connector, simpan scene, dan binding preview — panel
  properti/layer/asset tidak dibaca baris per baris.
- `public/animation-engine.js` tidak direview manual (tertutup 44 assertion test).
- `scenes.json` / `control-state.json` asli tidak dibuka (data pribadi).
- API TikTok/YouTube asli tidak dipanggil (test memakai fake).
- Tidak ada uji di browser sungguhan atau di OBS.
- Migrasi `platform-config.v1.bak.json` hanya dibaca kodenya.
