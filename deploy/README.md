# Panduan Online Amania

Panduan memindahkan Amania dari Laragon ke server (VPS Ubuntu 22.04/24.04). Semua perintah `php artisan` dijalankan di folder `backend/`.

> **Cek dulu:** `php artisan amania:preflight` memeriksa semua poin di bawah dan menandai yang GAGAL. Jalankan sebelum dan sesudah online.

---

## 1. Kebutuhan server

| Komponen | Paket Ubuntu |
| --- | --- |
| PHP 8.4 + FPM | `php8.4-fpm php8.4-mysql php8.4-mbstring php8.4-xml php8.4-zip php8.4-gd php8.4-curl php8.4-intl` |
| MySQL 8 | `mysql-server` |
| Konversi PDF | `poppler-utils` (`pdftoppm` + `pdftotext`) |
| Node.js 20+ | untuk frontend Next.js |
| Web server | `nginx`, `certbot python3-certbot-nginx` |
| Penjaga proses | `supervisor` (atau systemd bawaan) |

Minimal 2 GB RAM, 20 GB disk (gambar halaman buku ±1 MB per halaman PDF besar).

## 2. Konfigurasi

1. Salin kode ke `/var/www/amania` (folder `backend/` dan `frontend/`).
2. **Backend:** salin `backend/.env.production.example` → `backend/.env`, isi semua nilai `<...>`.
   - `APP_DEBUG=false` **wajib**.
   - `php artisan key:generate` (sekali saja).
3. **Frontend:** buat `frontend/.env.production` (lihat `frontend/.env.example`):
   ```
   NEXT_PUBLIC_API_URL=https://api.domain-anda.id/api
   NEXT_PUBLIC_SITE_URL=https://domain-anda.id
   NEXT_PUBLIC_APP_URL=https://domain-anda.id
   ```
4. Pasang & bangun:
   ```bash
   cd /var/www/amania/backend
   composer install --no-dev --optimize-autoloader
   php artisan migrate --force
   php artisan storage:link
   php artisan optimize
   sudo chown -R www-data:www-data storage bootstrap/cache

   cd ../frontend
   npm ci && npm run build
   ```
5. Nginx + HTTPS: `deploy/nginx/amania.conf` (petunjuk di dalam file).
6. Frontend sebagai layanan: `deploy/systemd/amania-frontend.service`.

## 3. Proses latar (WAJIB jalan terus)

Tanpa keduanya: email tidak terkirim, PDF tidak dikonversi, pesanan tidak kedaluwarsa.

| Proses | Tugas | Pasang |
| --- | --- | --- |
| **Queue worker** | email, konversi PDF | `deploy/supervisor/amania-worker.conf` **atau** `deploy/systemd/amania-worker.service` |
| **Scheduler** | kedaluwarsa pesanan, pengingat bayar, promo wishlist, cek kesehatan | `deploy/cron/amania.cron` |

Di Laragon (lokal), keduanya dijalankan oleh `run-dev.bat` — jendela "Queue Worker" dan "Scheduler" harus tetap terbuka.

## 4. Pemantauan & peringatan

Ada tiga lapis:

1. **Email otomatis ke admin** (setiap 5 menit, hanya di `APP_ENV=production`) bila: queue macet > 10 menit, ada tugas baru yang gagal, disk tersisa < 10%, atau konversi buku gagal. Email dikirim langsung (tidak lewat antrean), jadi tetap sampai walau worker mati. Masalah yang sama tidak diulang sebelum 6 jam; saat pulih, admin menerima email "Sistem kembali normal". Alamat tujuan: **Admin → Pengaturan → Email notifikasi admin**.
2. **Monitor uptime luar** — untuk kasus scheduler atau seluruh server mati (email di atas tidak bisa terkirim). Daftar gratis di [UptimeRobot](https://uptimerobot.com) atau BetterStack, lalu tambahkan monitor HTTP:
   - `https://api.domain-anda.id/api/health` → harus **200**. Jawaban **503** berarti database, scheduler, atau queue bermasalah (`{"failing":["scheduler"]}`).
   - `https://domain-anda.id` → frontend hidup.
3. **Panel Admin → Pengaturan → Status sistem** — ringkasan langsung: queue, scheduler, konverter PDF, ruang disk, mode debug.

Cek manual kapan saja: `php artisan amania:health-check`.

## 5. Setiap kali memperbarui kode

```bash
cd /var/www/amania/backend
php artisan down --retry=60
composer install --no-dev --optimize-autoloader
php artisan migrate --force
php artisan optimize
php artisan queue:restart          # worker memuat kode baru
php artisan up

cd ../frontend && npm ci && npm run build && sudo systemctl restart amania-frontend
php ../backend/artisan amania:preflight
```

## 6. Keamanan yang sudah aktif otomatis

- `APP_URL` https → semua URL buatan Laravel memakai https.
- `migrate:fresh` / `db:wipe` diblokir di produksi (mencegah database terhapus tak sengaja).
- Header keamanan di API dan toko: `nosniff`, anti-clickjacking, `Referrer-Policy`, `Permissions-Policy`, dan HSTS (khusus HTTPS produksi).
- `TRUSTED_PROXIES` agar IP pembaca terbaca benar di belakang Cloudflare (dipakai batas perangkat & log akses).

Sebelum online, ganti juga kata sandi dan email akun demo (`admin@amania.com`, `buyer@amania.com`). Preflight akan GAGAL selama akun admin masih memakai kata sandi bawaan.
