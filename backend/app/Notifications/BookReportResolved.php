<?php

namespace App\Notifications;

use App\Models\BookReport;
use Illuminate\Notifications\Messages\MailMessage;

/** Ke pelapor: hasil peninjauan laporan. */
class BookReportResolved extends AmaniaMailNotification
{
    public function __construct(public BookReport $report)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $r = $this->report;
        $accepted = $r->status === 'diterima';

        return $this->baseMessage(($accepted ? 'Laporan diterima' : 'Hasil peninjauan laporan') . ' — #' . $r->id)
            ->greeting('Halo, ' . explode(' ', trim($r->reporter_name))[0])
            ->line($accepted
                ? "Laporan Anda terhadap buku **{$r->book?->title}** kami terima. Buku tersebut sudah tidak lagi dijual di Srawung."
                : "Kami telah meninjau laporan Anda terhadap buku **{$r->book?->title}**, namun belum menemukan pelanggaran yang cukup untuk menurunkan buku tersebut.")
            ->line("Catatan tim: {$r->admin_note}")
            ->line('Bila Anda memiliki bukti tambahan, silakan kirim laporan baru dari halaman buku tersebut.');
    }
}
