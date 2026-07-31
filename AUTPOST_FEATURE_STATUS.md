# Free Autopost Feature Status

Tanggal: 2026-07-31

## Tujuan Awal

Menambahkan fitur utama:

- Embed utama `FREE AUTOPOST BY Clouds Capitalis`
- Tombol:
  - `Add Account`
  - `Manage Accounts`
  - `Start / Stop`
  - `Statistics`
  - `Hapus Akun`
- Modal untuk input token, channel, pesan, dan delay
- Simpan data ke Supabase
- Jalankan autopost dengan `setInterval()`

## Hasil Pengecekan Project

Project ini sudah memakai:

- `discord.js` untuk bot Discord
- PostgreSQL/Supabase via `pg`
- `index.js` sebagai entry point utama
- pola handler interaksi langsung di `interactionCreate`

## Sampai Mana Analisisnya

Saya sudah cek struktur dan menemukan:

- Command dan handler Discord ditulis langsung di `index.js`
- Database helper ada di `config/db.js`
- Contoh modul DB ada di `utils/uidService.js`
- Bot sudah memakai reply ephemeral pada banyak interaksi

## Batasan Yang Ditemukan

Bagian `account_token` untuk menyimpan token akun user dan menjalankan autopost dari akun pribadi tidak aman dan tidak cocok untuk implementasi bot Discord yang sehat.

Jadi, implementasi yang aman sebaiknya:

- tetap memakai bot Discord ini sebagai pengirim pesan
- menyimpan konfigurasi autopost per user
- mengirim pesan ke channel target dari bot, bukan token akun user

## Rencana Implementasi Aman

Kalau dilanjutkan, file yang kemungkinan akan disentuh:

- `index.js` untuk tombol, modal, dan logic interaksi
- file helper baru di `utils/` untuk autopost
- file migration SQL baru di `migrations/` untuk tabel Supabase

## Struktur Tabel yang Disarankan

```sql
CREATE TABLE IF NOT EXISTS autopost_settings (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    target_channel_id TEXT,
    message_content TEXT,
    delay_minutes INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Langkah Lanjut Saat Dilanjutkan

1. Tambahkan embed utama dan tombol di `index.js`
2. Tambahkan handler `ButtonInteraction`
3. Tambahkan handler `ModalSubmitInteraction`
4. Tambahkan helper Supabase/Postgres untuk simpan dan ambil konfigurasi
5. Tambahkan scheduler `setInterval()` per user
6. Tambahkan tombol `Statistics` dan `Hapus Akun`

## Catatan

Kalau nanti project ini mau dilanjutkan, saya sarankan tetap pakai desain aman di atas supaya tidak bergantung pada token akun user.
