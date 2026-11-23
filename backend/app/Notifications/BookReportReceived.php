<?php

namespace App\Notifications;

use App\Models\BookReport;
use Illuminate\Notifications\Messages\MailMessage;

/** Ke pelapor: tanda terima laporan. */
class BookReportReceived extends AmaniaMailNotification
{
    public function __construct(public BookReport $report)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $r = $this->report->loadMissing('book');

        return $this->baseMessage('Laporan Anda kami terima — #' . $r->id)
            ->greeting('Halo, ' . $this->md(explode(' ', trim($r->reporter_name))[0]))
            ->line("Terima kasih telah melaporkan buku **{$this->md($r->book?->title)}** (" . (BookReport::TYPES[$r->type] ?? $r->type) . ').')
            ->line('Tim kami akan meninjau laporan ini maksimal 3 hari kerja dan mengabari hasilnya melalui email ini. Bila diperlukan, kami akan menghubungi Anda untuk meminta bukti tambahan.')
            ->line("Nomor laporan: **#{$r->id}**");
    }
}
