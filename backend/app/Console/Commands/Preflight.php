<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\BookTextIndexer;
use App\Services\PdfPageConverter;
use App\Services\SystemHealth;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

/**
 * Pemeriksaan kesiapan sebelum (dan sesudah) online.
 *
 *   php artisan amania:preflight
 *
 * Kode keluar 1 bila ada pemeriksaan GAGAL — dapat dipakai di skrip deploy:
 *   php artisan amania:preflight || exit 1
 */
class Preflight extends Command
{
    protected $signature = 'amania:preflight';

    protected $description = 'Periksa konfigurasi produksi: keamanan, email, proses latar';

    /** @var list<array{string, string, string}> */
    private array $rows = [];

    private int $fails = 0;

    private int $warns = 0;

    public function handle(PdfPageConverter $converter, BookTextIndexer $indexer, SystemHealth $health): int
    {
        $prod = app()->isProduction();
        $appUrl = (string) config('app.url');
        $frontUrl = (string) config('app.frontend_url');

        // ── Keamanan ──────────────────────────────────────────────
        $this->check('APP_ENV production', $prod, (string) app()->environment(), 'Set APP_ENV=production di server.', warnOnly: true);
        $this->check('APP_DEBUG mati', !config('app.debug'), config('app.debug') ? 'true' : 'false', 'APP_DEBUG=true membocorkan detail error & konfigurasi ke publik. Set APP_DEBUG=false.');
        $this->check('APP_KEY terisi', (bool) config('app.key'), config('app.key') ? 'ada' : 'kosong', 'Jalankan php artisan key:generate (sekali saja, jangan diganti setelah online).');
        $this->check('APP_URL memakai HTTPS', str_starts_with($appUrl, 'https://'), $appUrl, 'Pasang sertifikat (Let\'s Encrypt) dan set APP_URL=https://api.domain-anda.', warnOnly: !$prod);
        $this->check('FRONTEND_URL memakai HTTPS', str_starts_with($frontUrl, 'https://'), $frontUrl, 'Set FRONTEND_URL=https://domain-anda (dipakai CORS & tautan email).', warnOnly: !$prod);
        $channel = (string) config('logging.default');
        if (config("logging.channels.{$channel}.driver") === 'stack') {
            $channel = (string) (config("logging.channels.{$channel}.channels")[0] ?? $channel);
        }
        $level = (string) config("logging.channels.{$channel}.level", 'debug');
        $this->check('LOG_LEVEL bukan debug', !$prod || $level !== 'debug', "{$channel} / {$level}", 'Set LOG_LEVEL=warning agar log tidak cepat membengkak.', warnOnly: true);

        $weak = User::where('role', 'admin')->get()->filter(fn (User $u) => $u->password && Hash::check('password123', $u->password));
        $this->check('Admin tanpa kata sandi bawaan', $weak->isEmpty(), $weak->isEmpty() ? 'aman' : $weak->count() . ' akun admin masih "password123"', 'Ganti kata sandi akun admin demo (atau hapus akunnya) sebelum online.');
        $demo = User::where('email', 'like', '%@amania.com')->whereNull('anonymized_at')->count();
        $this->check('Akun demo @amania.com', $demo === 0, $demo ? "{$demo} akun" : 'tidak ada', 'Domain amania.com bukan milik Anda: email ke akun ini tidak akan sampai. Ganti emailnya atau hapus akunnya.', warnOnly: true);

        $no2fa = User::where('role', 'admin')->where('is_blocked', false)->whereNull('two_factor_confirmed_at')->count();
        $this->check('2FA semua admin aktif', $no2fa === 0, $no2fa === 0 ? 'aktif' : "{$no2fa} admin belum", 'Masuk sebagai admin → Keamanan akun → aktifkan verifikasi dua langkah.', warnOnly: true);
        $lastIps = \App\Models\AccessLog::latest('id')->limit(50)->pluck('ip_address')->unique();
        $masked = $lastIps->count() > 0 && $lastIps->every(fn ($ip) => in_array($ip, ['127.0.0.1', '::1'], true));
        $this->check('IP asli pengunjung terbaca', !$masked, $masked ? 'semua 127.0.0.1' : 'ya', 'Set TRUSTED_PROXIES=127.0.0.1 lalu php artisan optimize; tanpa ini pembatas per-IP tidak berfungsi.', warnOnly: true);
        $this->check('File .env tertutup', PHP_OS_FAMILY === 'Windows' || !is_file(base_path('.env')) || (fileperms(base_path('.env')) & 0o007) === 0, PHP_OS_FAMILY === 'Windows' ? 'dilewati' : substr(sprintf('%o', @fileperms(base_path('.env'))), -4), 'Jalankan: chmod 600 .env', warnOnly: true);

        // ── Email ─────────────────────────────────────────────────
        $mailer = (string) config('mail.default');
        $this->check('Pengirim email aktif', !in_array($mailer, ['log', 'array'], true), $mailer, 'MAIL_MAILER=log/array berarti email tidak pernah terkirim.');
        $host = (string) config('mail.mailers.smtp.host');
        $this->check('Email domain sendiri', !str_contains($host, 'gmail.com'), $host ?: '-', 'Gmail dibatasi ±500 email/hari & rawan spam. Gunakan Brevo/Resend/SES dengan domain sendiri (SPF, DKIM, DMARC).', warnOnly: true);

        // ── Proses latar & alat ───────────────────────────────────
        $this->check('Queue bukan "sync"', config('queue.default') !== 'sync', (string) config('queue.default'), 'Set QUEUE_CONNECTION=database dan jalankan queue worker (Supervisor/systemd).');
        $queue = $health->queue();
        $this->check('Queue worker berjalan', $queue['ok'], "{$queue['pending']} menunggu, {$queue['failed']} gagal", 'Worker tidak memproses tugas. Lihat deploy/README.md → Proses latar.', warnOnly: true);
        $this->check('Scheduler berjalan', $health->scheduler()['ok'], $health->scheduler()['last_run'] ?? 'belum pernah', 'Tambahkan cron: * * * * * php artisan schedule:run. Lihat deploy/README.md.', warnOnly: true);
        $tool = $converter->detect();
        $this->check('Konverter PDF (pdftoppm)', $tool !== null, $tool['engine'] ?? 'tidak ditemukan', 'Pasang poppler-utils (apt install poppler-utils) atau isi PDF_CONVERTER_PATH.');
        $this->check('pdftotext (cari & daftar isi)', $indexer->pdftotextPath() !== null, $indexer->pdftotextPath() ? 'ada' : 'tidak ditemukan', 'Ikut terpasang bersama poppler-utils.', warnOnly: true);

        $toBytes = fn ($v) => (int) $v * match (strtolower(substr(trim((string) $v), -1))) { 'g' => 1024 ** 3, 'm' => 1024 ** 2, 'k' => 1024, default => 1 };
        $upload = min($toBytes(ini_get('upload_max_filesize')), $toBytes(ini_get('post_max_size')));
        $this->check('Batas unggahan PHP', $upload >= 64 * 1024 ** 2, ini_get('upload_max_filesize') . ' / post ' . ini_get('post_max_size'), 'Naikkan upload_max_filesize & post_max_size (mis. 512M) di CloudPanel → PHP Settings, dan client_max_body_size di Vhost. Foto HP & PDF buku bisa besar. (Nilai ini dari PHP CLI; cek juga PHP-FPM.)', warnOnly: true);

        // ── Penyimpanan ───────────────────────────────────────────
        // file_exists, bukan is_dir: junction Windows terbaca is_dir() = false.
        $linked = file_exists(public_path('storage'));
        $this->check('storage:link', $linked, $linked ? 'ada' : 'belum', 'Jalankan php artisan storage:link (sampul & QRIS tidak tampil tanpanya).');
        $this->check('Folder storage dapat ditulis', is_writable(storage_path('app')) && is_writable(storage_path('logs')), is_writable(storage_path('app')) ? 'ya' : 'tidak', 'Beri izin tulis untuk user web server pada backend/storage dan backend/bootstrap/cache.');
        $disk = $health->disk();
        $this->check('Ruang disk', $disk['ok'], $disk['free_percent'] !== null ? "{$disk['free_percent']}% kosong" : '-', 'Kosongkan disk atau pindahkan gambar halaman ke object storage.', warnOnly: true);

        // ── Performa ──────────────────────────────────────────────
        if ($prod) {
            $this->check('Konfigurasi di-cache', app()->configurationIsCached(), app()->configurationIsCached() ? 'ya' : 'tidak', 'Jalankan php artisan optimize setiap selesai deploy.', warnOnly: true);
        }

        $this->table(['', 'Pemeriksaan', 'Nilai'], array_map(fn ($r) => [$r[0], $r[1], $r[2]], $this->rows));
        foreach ($this->rows as $r) {
            if ($r[3] !== '') {
                $this->line(($r[0] === 'GAGAL' ? '<fg=red>✗</> ' : '<fg=yellow>!</> ') . "{$r[1]}: {$r[3]}");
            }
        }
        $this->newLine();

        if ($this->fails) {
            $this->error("{$this->fails} pemeriksaan GAGAL, {$this->warns} peringatan. Perbaiki yang gagal sebelum online.");

            return self::FAILURE;
        }
        $this->info($this->warns ? "Tidak ada yang gagal, {$this->warns} peringatan." : '✓ Semua pemeriksaan lolos.');

        return self::SUCCESS;
    }

    private function check(string $label, bool $ok, string $value, string $fix, bool $warnOnly = false): void
    {
        if ($ok) {
            $this->rows[] = ['OK', $label, $value, ''];

            return;
        }
        $warnOnly ? $this->warns++ : $this->fails++;
        $this->rows[] = [$warnOnly ? 'PERHATIAN' : 'GAGAL', $label, $value, $fix];
    }
}
