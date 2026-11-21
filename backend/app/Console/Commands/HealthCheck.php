<?php

namespace App\Console\Commands;

use App\Notifications\SystemAlert;
use App\Services\OrderLifecycle;
use App\Services\SystemHealth;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;
use Throwable;

/**
 * Dijalankan scheduler tiap 5 menit. Bila ada masalah (worker macet,
 * disk hampir penuh, …) admin langsung menerima email — dikirim SINKRON agar tetap
 * sampai walau queue worker sedang mati. Email untuk kumpulan masalah yang sama
 * tidak diulang sebelum masa jeda (HEALTH_ALERT_COOLDOWN_HOURS) lewat.
 *
 * Catatan: bila scheduler sendiri yang mati, perintah ini tidak berjalan — itulah
 * gunanya monitor uptime luar yang memantau GET /api/health.
 */
class HealthCheck extends Command
{
    protected $signature = 'amania:health-check {--silent-ok : Jangan cetak apa pun bila sehat}';

    protected $description = 'Periksa kesehatan sistem dan kirim email peringatan ke admin bila ada masalah';

    public function handle(SystemHealth $health): int
    {
        $problems = $health->problems();
        // Scheduler pasti hidup bila perintah ini dijalankan olehnya; heartbeat bisa
        // saja belum tercatat pada menit pertama, jadi jangan dilaporkan dari sini.
        unset($problems['scheduler']);

        // Tugas gagal bersifat kejadian (bukan keadaan): laporkan hanya yang BARU,
        // sekali saja, supaya admin tidak diingatkan terus untuk kegagalan lama.
        unset($problems['failed_jobs']);
        $failedNow = $health->queue()['failed'];
        $failedSeen = Cache::get('health:failed_seen');
        Cache::forever('health:failed_seen', $failedNow);
        if ($failedSeen !== null && $failedNow > $failedSeen) {
            $new = $failedNow - $failedSeen;
            $this->warn("✗ {$new} tugas latar baru gagal.");
            $this->notify(
                "{$new} tugas latar gagal",
                ['failed_jobs' => "{$new} tugas (mis. pengiriman email) gagal setelah beberapa kali dicoba. Total tugas gagal: {$failedNow}."],
                'Lihat penyebabnya dengan "php artisan queue:failed", lalu kirim ulang dengan "php artisan queue:retry all".',
            );
        }

        if (!$problems) {
            // Kabar "pulih" hanya bila sebelumnya admin benar-benar menerima peringatan.
            if (Cache::pull('health:alerted')) {
                $this->notify('Sistem kembali normal', [], 'Semua masalah yang dilaporkan sebelumnya sudah teratasi.');
            }
            if (!$this->option('silent-ok')) {
                $this->info('✓ Semua sistem sehat.');
            }

            return self::SUCCESS;
        }

        foreach ($problems as $msg) {
            $this->warn('✗ ' . $msg);
        }

        $codes = array_keys($problems);
        sort($codes);
        $key = 'health:alert:' . md5(implode('|', $codes));
        $cooldown = now()->addHours(max(1, (int) config('amania.health.alert_cooldown_hours', 6)));
        if (Cache::add($key, true, $cooldown)) {
            Cache::forever('health:alerted', true);
            $this->notify(
                count($problems) . ' masalah pada sistem Srawung',
                $problems,
                'Buka Admin → Pengaturan → Status sistem untuk detail. Panduan perbaikan ada di deploy/README.md.',
            );
        }

        return self::FAILURE;
    }

    /** @param array<string, string> $problems */
    private function notify(string $subject, array $problems, string $hint): void
    {
        $email = OrderLifecycle::adminEmail();
        if (!$email) {
            return;
        }
        try {
            Notification::route('mail', $email)->notifyNow(new SystemAlert($subject, $problems, $hint));
        } catch (Throwable $e) {
            report($e);
        }
    }
}
