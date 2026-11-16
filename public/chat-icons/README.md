# Ikon platform chat

Taruh ikon di folder ini dengan nama file:

- `tiktok.ico` (atau `.svg`, `.png`, `.webp`)
- `youtube.ico` (atau `.svg`, `.png`, `.webp`)

Ikon otomatis dipakai menggantikan `{platformTag}` di Chat Stack / Chat Notification.
Kalau file tidak ada, `{platformTag}` kembali memakai teks tag dari config
(`platform-config.json` → `chatFormat.tiktokTag` / `youtubeTag`).

Ganti file kapan saja; halaman overlay cukup di-reload untuk memuat ikon baru.
