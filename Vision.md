# LiveOverlay Studio — Visi & Arsitektur Produk

> Dokumen ini berisi visi produk, pilar fitur, dan prinsip desain yang **sudah settled** — jarang berubah. Baca ini kalau ragu soal arah/prinsip produk. Untuk status implementasi terkini, lihat [`issue.md`](./issue.md).

---

## 1. Latar Belakang & Masalah

Versi lama LiveOverlay cuma form sederhana: user ubah teks username & running text, tampilan overlay-nya statis (sudah di-hardcode di HTML). Ini gak sesuai kebutuhan asli.

**User adalah seorang desainer** (biasa pakai Adobe Illustrator) yang butuh overlay live streaming (TikTok Live Studio & OBS) yang:
- Terlihat dinamis & kekinian (banyak animasi/efek), bukan statis.
- Bisa didesain ulang dari GUI — bukan cuma ganti kata, tapi **bikin komposisi visual sendiri**.
- Support import aset desain sendiri (SVG dari Illustrator).
- Tools-nya personal use, jadi UX boleh dioptimalkan buat 1 user (bukan multi-tenant SaaS).

## 2. Visi Produk

**LiveOverlay Studio** = editor kanvas visual (mirip Canva/Figma versi ringan) khusus untuk merancang overlay streaming, plus mode "live" yang menampilkan hasil desain itu secara real-time sebagai browser source di OBS / TikTok Live Studio.

Prinsip utama: **What You See Is What You Stream** — apa yang user susun di kanvas editor, itu juga persis yang muncul di overlay saat live.

## 3. Pilar Fitur Utama

### 3.1 Canvas Editor
Area kerja visual (drag & drop) tempat user menyusun elemen overlay, mirip artboard di Illustrator/Figma. Punya representasi ukuran kanvas sesuai dimensi overlay (mis. 1920x1080 atau custom), grid/snap opsional, dan preview langsung.

### 3.2 Sistem Elemen (Layers)
Elemen-elemen yang bisa ditambahkan ke kanvas:
- **Text** (dinamis, termasuk yang bind ke data seperti username TikTok / running text / follower count).
- **Shape/Background** (kotak, lingkaran, gradient, dsb).
- **Image/SVG** (import aset desain user dari Illustrator).
- **Widget/Badge** (kombinasi shape+text siap pakai).

Setiap elemen adalah "layer" yang bisa di-reorder (z-index), di-duplicate, di-hide, dan dihapus.

### 3.3 Panel Properti
Saat elemen dipilih di kanvas, muncul panel untuk atur:
- Transform: posisi (x/y), ukuran, rotasi, skala.
- Style: warna, opacity, border, shadow, font (untuk text), border-radius, dsb.
- Animasi: preset animasi masuk/keluar/idle (fade, slide, bounce, pulse, dll, via GSAP) + durasi & delay.
- Data binding: elemen text bisa "terhubung" ke variabel dinamis (username, running text, live stats, external API) alih-alih teks statis.

### 3.4 Asset Management
User bisa upload SVG/PNG hasil desain dari Illustrator, tersimpan di server, lalu dipakai berulang sebagai elemen di kanvas manapun.

### 3.5 Scene / Preset Management & Multi-Output
Karena overlay dipakai untuk konteks beda-beda (mis. "Scene Gaming", "Scene Just Chatting", "Scene Ending"), user bisa simpan beberapa komposisi kanvas sebagai preset terpisah tanpa harus desain ulang dari nol.

Scene tidak terbatas pada satu scene aktif yang harus di-switch bergantian. Beberapa scene harus bisa dijalankan dan dirender secara bersamaan untuk output yang berbeda-beda, misalnya setup portrait dan landscape di TikTok Live Studio, atau live multi-platform seperti TikTok dan YouTube dengan layout masing-masing. Setiap scene memiliki identifier sendiri, dan overlay renderer dapat dimuat dengan parameter yang menunjuk ke scene spesifik.

### 3.6 Live Sync & Output
Overlay page (yang di-load sebagai browser source) merender scene yang aktif secara real-time, termasuk animasinya, dan otomatis update kalau user mengedit dari GUI editor.

## 4. Pergeseran Arsitektur (Konseptual)

Ini bukan lagi "form + settings.json", tapi:

- **Data model**: struktur **Scene** yang berisi daftar **Elements**, masing-masing punya properti transform/style/animasi/tipe kontennya sendiri. Modelnya extensible untuk nambah tipe elemen baru ke depannya.
- **Backend** (Bun + Elysia): simpan/load Scene (CRUD), serve asset upload (SVG/image), serve overlay renderer.
- **Frontend GUI editor**: aplikasi kanvas interaktif (vanilla JS + Tailwind, manual — bukan pakai library seperti Konva/Fabric, ini deviasi dari planning awal tapi sudah stabil berjalan).
- **Overlay renderer**: "player" yang membaca data Scene aktif dan me-render ulang elemen-elemennya + menjalankan animasinya (GSAP).

## 5. Stack Teknis

Bun + ElysiaJS (backend) · vanilla JS + Tailwind CSS (frontend, kompilasi lokal) · GSAP (animasi, via CDN) · data disimpan sebagai file JSON di root repo (`scenes.json`, `data-sources.json`, dll).

## 6. Yang SENGAJA Di-luar Scope

- Bukan produk multi-user/SaaS — tetap single-user, local-first.
- Bukan real-time collaborative editing.
- Bukan full vector editor (gak perlu reimplement fitur Illustrator secara penuh) — cukup bisa **menampilkan & mengatur** SVG yang sudah didesain dari luar (Illustrator), bukan menggambar vector dari nol di dalam tool.

## 7. Prinsip Desain yang Harus Dipegang

- **WYSIWYG**: tampilan di editor kanvas harus proporsional & merepresentasikan hasil akhir di overlay seakurat mungkin.
- **Extensible element model**: nambah tipe elemen baru di masa depan (misal nanti mau ada elemen "gauge", "chat box", dll) gak boleh butuh rombak ulang arsitektur data.
- **Tetap ringan & personal-use**: gak perlu over-engineer ke arah SaaS, tapi kode tetap terstruktur rapi supaya gampang dikembangkan bertahap.

## 8. Cara Kerja & Kolaborasi dengan AI Agent

- User cuma prompt per-fase (keterbatasan token), kadang dikerjakan agent yang beda-beda untuk tiap fase, lanjutin progres yang keputus dari agent sebelumnya.
- **Selalu verifikasi isi kode PR secara langsung (diff GitHub), jangan percaya judul/deskripsi PR mentah-mentah** — pernah ada insiden PR metadata ngaco karena model yang beda dipakai gak sengaja (isi kode tetap benar, tapi judul/deskripsi ngasal).
- Implementasikan per-fase, jangan sekaligus. Setiap fase harus menghasilkan output yang bisa dijalankan dan diverifikasi sebelum lanjut ke fase berikutnya.
- Fokus pada clean, functional implementation. Struktur data harus extensible tapi jangan over-engineer.
- Overlay renderer harus tetap transparan dan kompatibel sebagai OBS Browser Source.
- Tiap fase baru sebaiknya di-review dulu (cek diff GitHub) sebelum lanjut, diverifikasi align sama `VISION.md` ini + prinsip WYSIWYG, extensible element model, tetap ringan.