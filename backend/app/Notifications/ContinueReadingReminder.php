<?php

namespace App\Notifications;

use App\Models\Book;
use App\Services\EmailPreferences;
use App\Services\NextReads;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\HtmlString;

/**
 * Email "lanjutkan membaca": progres, sisa halaman & perkiraan waktu, tombol kembali
 * ke halaman terakhir, dan satu saran bacaan berikutnya.
 */
class ContinueReadingReminder extends AmaniaMailNotification
{
    /** Perkiraan rata-rata waktu baca per halaman (menit). */
    private const MINUTES_PER_PAGE = 1.5;

    public function __construct(public int $bookId, public int $page)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $book = Book::findOrFail($this->bookId);
        $total = max(1, (int) $book->total_pages);
        $page = min($this->page, $total);
        $percent = (int) floor($page / $total * 100);
        $left = $total - $page;
        $title = (string) str($book->title)->before(':')->limit(60);

        $bar = '<div style="margin:6px 0 4px;height:10px;border-radius:999px;background:#e2e8f0;overflow:hidden">'
            . '<div style="height:10px;width:' . $percent . '%;background:#2fae7b;border-radius:999px"></div></div>'
            . '<div style="font-size:13px;color:#475569">Halaman ' . $page . ' dari ' . $total . ' · <strong>' . $percent . '% selesai</strong></div>';

        $message = $this->baseMessage("Lanjutkan membaca \"{$title}\"? Anda sudah {$percent}%")
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line(new HtmlString('Anda sudah sampai di halaman ' . $page . ' buku <strong>' . e($book->title) . '</strong>. Sayang kalau berhenti di tengah jalan.'))
            ->line(new HtmlString($bar))
            ->line('Sisa ' . $left . ' halaman (kira-kira ' . $this->duration($left) . ' membaca). ' . $this->pace($left))
            ->action("Lanjut dari halaman {$page}", $this->frontendUrl('baca/' . $book->slug));

        if ($next = $this->nextRead($book, $notifiable)) {
            $message->line(new HtmlString('Setelah selesai, pembaca biasanya lanjut ke <a href="' . e($this->frontendUrl('buku/' . $next->slug)) . '" style="color:#0f4c3f;font-weight:600">' . e($next->title) . '</a>.'));
        }

        return $message->line(new HtmlString(
            '<span style="font-size:12px;color:#64748b">Anda menerima email ini karena membeli buku ini di Srawung. Tidak ingin menerima pengingat? <a href="'
            . e(EmailPreferences::reminderUnsubscribeUrl($notifiable)) . '" style="color:#64748b">Matikan di sini</a>.</span>'
        ));
    }

    private function duration(int $pages): string
    {
        $minutes = (int) ceil($pages * self::MINUTES_PER_PAGE);
        if ($minutes < 60) {
            return "{$minutes} menit";
        }
        $hours = round($minutes / 60, 1);

        return str_replace('.', ',', (string) ($hours == (int) $hours ? (int) $hours : $hours)) . ' jam';
    }

    /** Target ringan: berapa lama selesai bila membaca 15 menit sehari. */
    private function pace(int $pages): string
    {
        $days = (int) ceil($pages * self::MINUTES_PER_PAGE / 15);
        if ($days <= 1) {
            return 'Cukup satu sesi santai 15 menit untuk menamatkannya.';
        }
        $span = $days <= 13 ? "{$days} hari" : 'sekitar ' . (int) round($days / 7) . ' minggu';

        return "Dengan 15 menit sehari, buku ini tamat dalam {$span}.";
    }

    private function nextRead(Book $book, object $notifiable): ?Book
    {
        try {
            foreach (app(NextReads::class)->for($book, $notifiable, 3) as $item) {
                if (!$item['owned']) {
                    return $item['book'];
                }
            }
        } catch (\Throwable $e) {
            report($e); // saran bacaan hanya pelengkap
        }

        return null;
    }
}
