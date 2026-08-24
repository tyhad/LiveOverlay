# LiveOverlay Studio — Planning Dokumen (High-Level)

> Dokumen ini adalah planning tingkat tinggi untuk redesign total project **LiveOverlay**.
> Ditujukan untuk dipakai oleh model AI lain sebagai panduan implementasi bertahap.
> Fokus dokumen ini: **apa** yang harus dibangun dan **urutan prioritasnya**, bukan detail kode.

---

## 1. Latar Belakang & Masalah

Versi saat ini cuma form sederhana: user ubah teks username & running text, tampilan overlay-nya statis (sudah di-hardcode di HTML). Ini gak sesuai kebutuhan asli.

**User adalah seorang desainer** (biasa pakai Adobe Illustrator) yang butuh overlay live streaming (TikTok Live Studio & OBS) yang:
- Terlihat dinamis & kekinian (banyak animasi/efek), bukan statis.
- Bisa didesain ulang dari GUI — bukan cuma ganti kata, tapi **bikin komposisi visual sendiri**.
- Support import aset desain sendiri (SVG dari Illustrator).
- Tools-nya personal use, jadi UX boleh dioptimalkan buat 1 user (bukan multi-tenant SaaS).

## 2. Visi Produk

**LiveOverlay Studio** = editor kanvas visual (mirip Canva/Figma versi ringan) khusus untuk merancang overlay streaming, plus mode "live" yang menampilkan hasil desain itu secara real-time sebagai browser source di OBS / TikTok Live Studio.

Prinsip utama: **What You See Is What You Stream** — apa yang user susun di kanvas editor, itu juga persis yang muncul di overlay saat live.

## 3. Pilar Fitur Utama

Susun berdasarkan pilar, bukan urutan development (urutan ada di bagian Fase):

### 3.1 Canvas Editor
Area kerja visual (drag & drop) tempat user menyusun elemen overlay, mirip artboard di Illustrator/Figma. Harus punya representasi ukuran kanvas sesuai dimensi overlay (mis. 1920x1080 atau custom), grid/snap opsional, dan preview langsung.

### 3.2 Sistem Elemen (Layers)
Elemen-elemen yang bisa ditambahkan ke kanvas, minimal:
- **Text** (dinamis, termasuk yang bind ke data seperti username TikTok / running text / follower count nantinya).
- **Shape/Background** (kotak, lingkaran, gradient, dsb).
- **Image/SVG** (import aset desain user dari Illustrator).
- **Widget/Badge** (kombinasi shape+text siap pakai, seperti badge username yang sekarang).

Setiap elemen adalah "layer" yang bisa di-reorder (z-index), di-duplicate, di-hide, dan dihapus. Ini prinsip yang sama seperti layer panel di software desain.

### 3.3 Panel Properti
Saat elemen dipilih di kanvas, muncul panel untuk atur:
- Transform: posisi (x/y), ukuran, rotasi, skala.
- Style: warna, opacity, border, shadow, font (untuk text), border-radius, dsb.
- Animasi: pilih preset animasi masuk/keluar/idle (fade, slide, bounce, pulse, dll — bisa manfaatkan GSAP yang sudah ada di stack) + durasi & delay.
- Data binding (opsional, tahap lanjut): elemen text bisa "terhubung" ke variabel dinamis (username, running text) alih-alih teks statis.

### 3.4 Asset Management
User bisa upload SVG/PNG hasil desain dari Illustrator, tersimpan di server, lalu dipakai berulang sebagai elemen di kanvas manapun.

### 3.5 Scene / Preset Management & Multi-Output
Karena overlay dipakai untuk konteks beda-beda (mis. "Scene Gaming", "Scene Just Chatting", "Scene Ending"), user bisa simpan beberapa komposisi kanvas sebagai preset terpisah tanpa harus desain ulang dari nol.

Scene tidak terbatas pada satu scene aktif yang harus di-switch bergantian. Beberapa scene harus bisa dijalankan dan dirender secara bersamaan untuk output yang berbeda-beda, misalnya setup portrait dan landscape di TikTok Live Studio, atau live multi-platform seperti TikTok dan YouTube dengan layout masing-masing. Setiap scene memiliki identifier sendiri, dan overlay renderer dapat dimuat dengan parameter yang menunjuk ke scene spesifik. Dengan begitu, tiap OBS Browser Source atau instance overlay menampilkan scene pilihannya secara independen dan tetap tersinkron secara real-time tanpa saling mengganggu.

### 3.6 Live Sync & Output
Overlay page (yang di-load sebagai browser source) merender scene yang aktif secara real-time, termasuk animasinya, dan otomatis update kalau user mengedit dari GUI editor (mirip behavior polling yang sudah ada sekarang, tapi sekarang me-render seluruh komposisi visual, bukan cuma 2 field teks).

## 4. Pergeseran Arsitektur (Konseptual)

Ini bukan lagi "form + settings.json", tapi:

- **Data model bergeser** dari `{ tiktokUsername, runningText }` menjadi struktur **Scene** yang berisi daftar **Elements**, masing-masing punya properti transform/style/animasi/tipe kontennya sendiri. (Skema detail biar dirancang di tahap implementasi, cukup pastikan modelnya extensible untuk nambah tipe elemen baru ke depannya.)
- **Backend** (Bun + Elysia yang sudah ada) perannya berkembang jadi: simpan/load Scene (CRUD), serve asset upload (SVG/image), serve overlay renderer.
- **Frontend GUI editor** butuh jadi aplikasi kanvas interaktif sungguhan — bukan lagi halaman form HTML biasa. Ini kemungkinan butuh library canvas (misal Konva.js atau Fabric.js) untuk urusan drag/resize/rotate elemen, supaya gak reinvent-the-wheel.
- **Overlay renderer** (halaman yang dibuka di OBS) jadi "player" yang membaca data Scene aktif dan me-render ulang elemen-elemennya + menjalankan animasinya (tetap bisa pakai GSAP yang sudah dipakai sekarang).

## 5. Fase Implementasi (Prioritas Bertahap)

Jangan coba build semuanya sekaligus. Urutan disarankan:

### Fase 1 — Fondasi Kanvas & CRUD Elemen Dasar
Bangun editor kanvas minimal: bisa nambah elemen Text & Shape, drag untuk posisi, resize, dan simpan/load Scene sederhana ke backend. Overlay renderer bisa menampilkan hasil Scene itu (statis dulu, tanpa animasi).

### Fase 2 — Panel Properti Lengkap
Tambahkan panel edit properti detail (warna, font, ukuran presisi via input angka, opacity, rotasi, z-index/reorder layer).

### Fase 3 — Sistem Animasi
Tambahkan pilihan animasi (preset GSAP) per elemen — animasi masuk, animasi idle/loop, animasi keluar. Overlay renderer menjalankan animasi ini saat scene di-load / elemen muncul.

### Fase 4 — Asset & SVG Import
Fitur upload SVG/gambar dari user, elemen tipe "Image/SVG" bisa dipakai di kanvas seperti elemen lain (posisi, ukuran, animasi tetap berlaku).

### Fase 5a — Platform Live Stats
Hubungkan elemen Text tertentu ke data yang berasal dari platform streaming itu sendiri, seperti username, viewer count, follower count, live chat, dan data platform relevan lainnya. Tujuannya agar kombinasi "desain visual bebas" + "data yang update real-time" tetap jalan bareng.

### Fase 5b — External Data Source (Generic API Binding)
Tambahkan sistem data source yang fleksibel agar user dapat mengonfigurasi API eksternal apa pun dan memilih field dari response API tersebut untuk ditampilkan pada elemen overlay. Contoh use case-nya adalah data F1, seperti track condition dari API publik semacam FastF1, maupun API free-to-use lainnya.

Polling API eksternal sebaiknya dilakukan di sisi backend dengan caching, bukan langsung dari overlay browser source, supaya latency atau rate-limit API luar tidak mengganggu kecepatan render overlay.

### Fase 6 — Multi-Scene & Multi-Output
Kemampuan menyimpan banyak Scene, memberi nama dan identifier pada tiap scene, serta menjalankan beberapa scene secara concurrent pada output atau URL overlay yang berbeda. Setiap OBS Browser Source atau instance overlay dapat memilih scene spesifik secara independen, sehingga beberapa layout untuk stance, orientasi, atau platform live yang berbeda dapat tampil dan tersinkron pada waktu yang sama tanpa reset atau saling mengganggu.

### Fase 7 — Polish UX Editor
Snap-to-grid, alignment guide, keyboard shortcut, undo/redo, dsb — hal-hal yang bikin proses desain di dalam tool ini terasa senyaman software desain sungguhan.

## 6. Yang SENGAJA Di-luar Scope (untuk sekarang)

Supaya model implementasi gak melebar:
- Bukan produk multi-user/SaaS — tetap single-user, local-first.
- Bukan real-time collaborative editing.
- Bukan full vector editor (gak perlu reimplement fitur Illustrator secara penuh) — cukup bisa **menampilkan & mengatur** SVG yang sudah didesain dari luar (Illustrator), bukan menggambar vector dari nol di dalam tool.

## 7. Prinsip Desain yang Harus Dipegang

- **WYSIWYG**: tampilan di editor kanvas harus proporsional & merepresentasikan hasil akhir di overlay seakurat mungkin.
- **Extensible element model**: nambah tipe elemen baru di masa depan (misal nanti mau ada elemen "gauge", "chat box", dll) gak boleh butuh rombak ulang arsitektur data.
- **Tetap ringan & personal-use**: gak perlu over-engineer ke arah SaaS, tapi kode tetap terstruktur rapi supaya gampang dikembangkan bertahap sesuai fase di atas.

## 8. Execution Notes for AI

- Implementasikan per-fase, jangan sekaligus. Setiap fase harus menghasilkan output yang bisa dijalankan dan diverifikasi sebelum lanjut ke fase berikutnya.
- Stack yang sudah ada (Bun, ElysiaJS, Tailwind CSS, GSAP) tetap dipakai. Tambahkan library canvas (Konva.js atau Fabric.js) sesuai kebutuhan.
- Fokus pada clean, functional implementation. Struktur data harus extensible tapi jangan over-engineer.
- Overlay renderer harus tetap transparan dan kompatibel sebagai OBS Browser Source.
