# 🎬 LiveOverlay

**LiveOverlay** adalah aplikasi dynamic stream overlay modern dan super ringan yang ditenagai oleh **Bun**, **ElysiaJS**, **Tailwind CSS**, dan animasi **GSAP**.

Didesain khusus untuk live streamer (TikTok Live, YouTube, Twitch) agar dapat memperbarui informasi username, running text, atau pengumuman secara langsung di layar OBS tanpa perlu me-reload browser source.

---

## ✨ Fitur Utama

- ⚡ **Super Cepat & Ringan**: Backend menggunakan [Bun](https://bun.sh/) dan [ElysiaJS](https://elysiajs.com/).
- 🎛️ **Control Panel Terintegrasi**: Dashboard responsif untuk mengubah username TikTok dan pesan running text secara real-time.
- 🎨 **Overlay Siap Pakai untuk OBS**: Tampilan transparan dengan animasi masuk (*entrance animation*) mulus dari GSAP.
- 🔄 **Real-Time Auto Sync**: Overlay otomatis mendeteksi pembaruan data dari Control Panel tanpa perlu me-refresh OBS Browser Source.
- 🔒 **Local Binding & Secure**: Server secara default hanya terikat ke `127.0.0.1` (localhost) dengan opsi perlindungan `SETTINGS_SECRET`.
- 📦 **Zero CDN Dependency**: Menggunakan Tailwind CSS yang dikompilasi secara lokal untuk performa maksimal dan stabilitas offline/LAN.

---

## 📋 Prasyarat

Pastikan komputer Anda sudah terinstal **[Bun](https://bun.sh/)** (versi 1.1+).

Jika belum terinstal di Windows:
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

---

## 🚀 Instalasi & Menjalankan

1. **Clone repository & masuk ke folder:**
   ```bash
   git clone https://github.com/tyhad/LiveOverlay.git
   cd LiveOverlay
   ```

2. **Instal dependensi:**
   ```bash
   bun install
   ```

3. **Build aset CSS & JS:**
   ```bash
   bun run build
   ```

4. **Jalankan Server Development:**
   ```bash
   bun run dev
   ```

Server akan aktif di: **`http://127.0.0.1:3000`**

---

## 🎮 Panduan Penggunaan

### 1. Membuka Control Panel
Buka web browser Anda dan akses:
👉 **[http://localhost:3000](http://localhost:3000)**

- Masukkan **Username TikTok** (misal: `@creator`).
- Masukkan pesan **Running Text** (misal: `Jangan lupa follow & like stream ini! ✨`).
- Klik **Save Changes**. Status `"Saved!"` akan muncul sebagai tanda data telah tersimpan ke `settings.json`.

---

### 2. Memasang Overlay di OBS Studio

1. Buka **OBS Studio**.
2. Pada panel **Sources**, klik tombol **`+`** lalu pilih **Browser** (Browser Source).
3. Beri nama source (misalnya: `LiveOverlay Widget`).
4. Atur properti Browser Source sebagai berikut:
   - **URL**: `http://localhost:3000/overlay.html`
   - **Width**: `800` (atau sesuaikan dengan layout stream Anda)
   - **Height**: `300`
   - **Custom CSS**: *(Biarkan kosong atau default)*
   - **Shutdown source when not visible**: Centang (opsional)
   - **Refresh browser when scene becomes active**: Centang (opsional)
5. Klik **OK**. Widget overlay transparan akan muncul di kanvas OBS dengan animasi GSAP yang halus.

---

## 🛠️ Perintah Script yang Tersedia

| Command | Keterangan |
| :--- | :--- |
| `bun run dev` | Menjalankan server backend dalam mode watch |
| `bun run dev:css` | Menjalankan watch compiler untuk Tailwind CSS |
| `bun run build` | Mengompilasi Tailwind CSS dan bundle JS klien |
| `bun run build:css` | Mengompilasi `src/styles/input.css` ke `public/styles.css` |
| `bun run build:js` | Mengompilasi `src/client/app.ts` ke `public/js/app.js` |
| `bun start` | Menjalankan server dalam mode produksi |

---

## 🔒 Konfigurasi & Keamanan

### Template Konfigurasi
Aplikasi membaca dan menulis data ke `settings.json` (diabaikan oleh git). Anda dapat melihat contoh format di [`settings.example.json`](./settings.example.json):

```json
{
  "tiktokUsername": "@creator",
  "runningText": "Welcome to my stream! Jangan lupa follow & share ✨"
}
```

### Opsi Token Rahasia (Shared Secret)
Jika Anda ingin menambahkan proteksi ekstra pada endpoint update settings `POST /api/settings`, buat file `.env` dan tambahkan:

```env
SETTINGS_SECRET=kunci_rahasia_anda_disini
```

---

## 📁 Struktur Proyek

```text
LiveOverlay/
├── public/
│   ├── index.html           # Control Panel Dashboard (GUI)
│   ├── overlay.html         # Transparent OBS Browser Source Overlay
│   ├── styles.css           # Compiled Tailwind CSS
│   └── js/app.js            # Bundled client script
├── src/
│   ├── index.ts             # ElysiaJS Backend Server & API Routes
│   ├── styles/input.css     # Tailwind CSS entry directive
│   └── client/app.ts        # GSAP frontend client entry
├── settings.example.json    # Template data settings
├── package.json             # Project dependencies & scripts
├── tsconfig.json            # TypeScript configuration
└── README.md                # Dokumentasi proyek
```

---

## 📄 Lisensi

Proyek ini dibuat untuk keperluan personal/komunitas streaming. Bebas digunakan dan dimodifikasi.
