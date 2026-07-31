# Free Autopost Feature Status

Tanggal: 2026-07-31

## Status Sekarang

Autopost sudah berjalan dengan dua lapis penyimpanan:

- data utama disimpan ke tabel `autopost_settings`
- file `autopost.config.json` ikut disinkronkan ulang dari database

Artinya:

- save dari panel tidak cuma masuk DB, tapi juga menulis file config
- `post.js` masih bisa baca config file saat startup
- file config sekarang berperan sebagai output sinkronisasi, bukan sumber manual utama

## Alur Yang Sudah Ada

- `index.js` menangani tombol, modal, dan command autopost
- `utils/autopostService.js` menangani query DB dan sinkronisasi file config
- `post.js` membaca `autopost.config.json` dan menjalankan autopost worker
- PostgreSQL/Supabase tetap jadi sumber data aktif

## Perubahan Penting

- `ready` event di bot diganti ke `clientReady`
- modal autopost untuk tombol `add/manage` dibuat lebih cepat agar tidak kena `Unknown interaction`
- sync file config dilakukan setelah:
  - save dari panel
  - start
  - stop
  - delete

## Catatan Teknis

Warning yang masih mungkin muncul di log:

- `ephemeral` deprecated di discord.js v14/v15 path modern
- ini bukan crash, tapi perlu dirapikan ke `flags` kalau mau log bersih

Error yang sudah ditangani:

- `DiscordAPIError[10062]: Unknown interaction`
- `Missing config file: /root/discord-bot/autopost.config.json`

## Sisa Risiko

Karena file config sekarang ditulis dari database:

- edit manual `autopost.config.json` bisa ketimpa oleh sinkronisasi berikutnya
- kalau database kosong, file config juga bisa ikut kosong

## File Yang Relevan

- `index.js`
- `utils/autopostService.js`
- `post.js`
- `autopost.config.json`
- `migrations/autopost_settings.sql`

## Next Step Kalau Mau Dirapikan Lagi

1. Ganti semua `ephemeral: true` ke format `flags`
2. Tambahkan handling error yang lebih spesifik untuk `Unknown interaction`
3. Pertimbangkan jadikan DB sebagai satu-satunya sumber data, lalu `post.js` baca langsung dari DB
