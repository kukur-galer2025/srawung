<?php

namespace App\Console\Commands;

use App\Models\UserLibrary;
use App\Notifications\ContinueReadingReminder;
use Illuminate\Console\Command;

/**
 * Pengingat "lanjutkan membaca". Dijalankan scheduler sekali sehari (sore hari WIB).
 *
 * Kandidat: buku di perpustakaan yang sudah dibaca 10–85%, masih tersisa ≥ 5 halaman,
 * dan tidak dibuka 7–30 hari terakhir. Aturannya:
 *  - Satu email per macet-baca: setelah diingatkan, buku itu baru bisa diingatkan lagi
 *    bila pembaca sempat membukanya lalu berhenti lagi.
 *  - Maksimal satu email per pengguna tiap 14 hari, berisi buku yang paling dekat selesai.
 *  - Lewati pengguna yang belum verifikasi email, diblokir, dihapus, atau mematikan pengingat.
 */
class SendReadingReminders extends Command
{
    protected $signature = 'amania:reading-reminders';

    protected $description = 'Kirim email pengingat untuk buku yang berhenti dibaca di tengah jalan';

    public const MIN_PROGRESS = 0.10;
    public const MAX_PROGRESS = 0.85;
    public const MIN_PAGES_LEFT = 5;
    public const IDLE_DAYS = 7;
    public const MAX_IDLE_DAYS = 30;
    public const USER_COOLDOWN_DAYS = 14;

    public function handle(): int
    {
        $rows = UserLibrary::with(['user', 'book'])
            ->where('access_status', 'active')
            ->whereNotNull('last_read_at')
            ->whereBetween('last_read_at', [now()->subDays(self::MAX_IDLE_DAYS), now()->subDays(self::IDLE_DAYS)])
            ->where(fn ($q) => $q->whereNull('resume_reminded_at')->orWhereColumn('resume_reminded_at', '<', 'last_read_at'))
            ->whereHas('book', fn ($b) => $b->where('status', 'published')->where('total_pages', '>', 0))
            ->orderBy('id')
            ->limit(2000)
            ->get();

        // Pilih satu buku per pengguna: yang paling dekat selesai.
        $best = [];
        foreach ($rows as $row) {
            $total = (int) $row->book->total_pages;
            $page = (int) $row->last_read_page;
            $progress = $page / $total;
            if ($progress < self::MIN_PROGRESS || $progress > self::MAX_PROGRESS || $total - $page < self::MIN_PAGES_LEFT) {
                continue;
            }
            if (!isset($best[$row->user_id]) || $progress > $best[$row->user_id]['progress']) {
                $best[$row->user_id] = ['row' => $row, 'progress' => $progress];
            }
        }

        $sent = 0;
        foreach ($best as $userId => ['row' => $row]) {
            $user = $row->user;
            if (!$user || $user->is_blocked || $user->anonymized_at || !$user->hasVerifiedEmail() || !$user->reminder_emails) {
                continue;
            }
            $recent = UserLibrary::where('user_id', $userId)
                ->where('resume_reminded_at', '>=', now()->subDays(self::USER_COOLDOWN_DAYS))->exists();
            if ($recent) {
                continue;
            }

            // Klaim atomik → tidak ada email ganda bila dua scheduler berjalan bersamaan.
            $claimed = UserLibrary::whereKey($row->id)
                ->where(fn ($q) => $q->whereNull('resume_reminded_at')->orWhereColumn('resume_reminded_at', '<', 'last_read_at'))
                ->update(['resume_reminded_at' => now()]);
            if (!$claimed) {
                continue;
            }

            try {
                $user->notify(new ContinueReadingReminder($row->book_id, (int) $row->last_read_page));
                $sent++;
            } catch (\Throwable $e) {
                report($e);
            }
        }

        $this->info("Pengingat lanjut membaca terkirim: {$sent}");

        return self::SUCCESS;
    }
}
