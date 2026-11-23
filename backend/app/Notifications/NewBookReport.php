<?php

namespace App\Notifications;

use App\Models\BookReport;
use Illuminate\Notifications\Messages\MailMessage;

/** Ke admin: ada laporan baru terhadap sebuah buku. */
class NewBookReport extends AmaniaMailNotification
{
    public function __construct(public BookReport $report)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $r = $this->report->loadMissing('book');
        $type = BookReport::TYPES[$r->type] ?? $r->type;

        $mail = $this->baseMessage("Laporan buku: {$type} — " . str($r->book?->title)->limit(50))
            ->greeting('Ada laporan konten baru')
            ->line("Buku: **{$this->md($r->book?->title)}**")
            ->line("Jenis: {$type} · Pelapor: {$this->md($r->reporter_name)} (" . (BookReport::RELATIONSHIPS[$r->relationship] ?? $r->relationship) . ", {$r->reporter_email})")
            ->line('> ' . $this->md(trim(preg_replace('/\s+/', ' ', str($r->description)->limit(600)))));
        if ($r->evidence_url) {
            $mail->line('Bukti (tautan dari pelapor, buka dengan hati-hati): ' . $this->md($r->evidence_url));
        }

        return $mail->action('Tinjau laporan', $this->frontendUrl('admin/laporan-konten'))
            ->line('Tinjau dalam 3 hari kerja. Untuk klaim hak cipta yang kuat, buku sebaiknya diturunkan dulu sambil menunggu klarifikasi kreator.');
    }
}
