<?php

namespace App\Services;

use App\Models\Book;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Satu sumber kebenaran untuk kesehatan sistem. Dipakai oleh:
 *  - GET /api/health          → monitor uptime luar (UptimeRobot dll.)
 *  - amania:health-check      → email peringatan ke admin
 *  - halaman Pengaturan admin → panel "Status sistem"
 */
class SystemHealth
{
    public function database(): bool
    {
        try {
            DB::select('select 1');
            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    /** @return array{ok: bool, pending: int, oldest_waiting_seconds: int, failed: int} */
    public function queue(): array
    {
        $pending = DB::table('jobs')->count();
        $oldest = DB::table('jobs')->min('available_at');
        $oldestAge = $oldest ? max(0, now()->timestamp - (int) $oldest) : 0;

        return [
            // Job menunggu > 2 menit berarti worker kemungkinan besar tidak berjalan.
            'ok' => $oldestAge < 120,
            'pending' => $pending,
            'oldest_waiting_seconds' => $oldestAge,
            'failed' => DB::table('failed_jobs')->count(),
        ];
    }

    /** @return array{ok: bool, last_run: ?string} */
    public function scheduler(): array
    {
        $lastRun = Cache::get('heartbeat:scheduler');
        $age = $lastRun ? (int) Carbon::parse($lastRun)->diffInSeconds(now()) : null;

        return ['ok' => $age !== null && $age < 180, 'last_run' => $lastRun];
    }

    /** @return array{ok: bool, free_percent: ?float, free_bytes: ?int} */
    public function disk(): array
    {
        $path = storage_path();
        $free = @disk_free_space($path);
        $total = @disk_total_space($path);
        if (!$free || !$total) {
            return ['ok' => true, 'free_percent' => null, 'free_bytes' => null];
        }
        $percent = round($free / $total * 100, 1);

        return [
            'ok' => $percent >= config('amania.health.min_free_disk_percent', 10),
            'free_percent' => $percent,
            'free_bytes' => (int) $free,
        ];
    }

    public function booksFailed(): int
    {
        return Book::where('processing_status', 'failed')->count();
    }

    /**
     * Daftar masalah yang perlu tindakan, dalam bahasa admin.
     *
     * @return array<string, string> kode => pesan
     */
    public function problems(): array
    {
        if (!$this->database()) {
            return ['database' => 'Database tidak dapat diakses.'];
        }

        $problems = [];
        $queue = $this->queue();
        // Ambang peringatan 10 menit (bukan 2): worker yang sedang mengonversi PDF besar
        // wajar membuat tugas lain menunggu beberapa menit.
        if ($queue['oldest_waiting_seconds'] >= 600) {
            $problems['queue'] = sprintf(
                'Queue worker tidak memproses tugas: %d tugas tertahan, yang terlama %d menit. Email dan konversi PDF berhenti.',
                $queue['pending'],
                intdiv($queue['oldest_waiting_seconds'], 60),
            );
        }
        if ($queue['failed'] > 0) {
            $problems['failed_jobs'] = "{$queue['failed']} tugas latar gagal permanen (lihat: php artisan queue:failed).";
        }
        if (!$this->scheduler()['ok']) {
            $problems['scheduler'] = 'Scheduler tidak berjalan: pesanan tidak kedaluwarsa otomatis dan pengingat tidak terkirim.';
        }
        $disk = $this->disk();
        if (!$disk['ok']) {
            $problems['disk'] = "Ruang disk server tinggal {$disk['free_percent']}%.";
        }
        if (($failed = $this->booksFailed()) > 0) {
            $problems['books_failed'] = "{$failed} buku gagal dikonversi menjadi halaman.";
        }

        return $problems;
    }
}
