# Ikon platform chat

Taruh ikon di folder ini dengan nama file `tiktok.<ext>` dan `youtube.<ext>`.
Ekstensi yang didukung, berurutan sesuai prioritas: `.svg`, `.png`, `.webp`, `.ico`.

Ikon otomatis dipakai menggantikan `{platformTag}` di Chat Stack / Chat Notification
(ukuran mengikuti `font-size` elemen). Kalau file tidak ada, `{platformTag}` kembali
memakai teks tag dari config (`platform-config.json` → `chatFormat.tiktokTag` / `youtubeTag`).

Running Text dan Scroll Text tidak memakai ikon — di sana `{platformTag}` selalu jadi teks tag.

Ganti file kapan saja; halaman overlay cukup di-reload untuk memuat ikon baru
(server memeriksa isi folder tiap ±5 detik, jadi tidak perlu restart).
