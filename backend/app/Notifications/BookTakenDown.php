<?php

namespace App\Notifications;

use App\Models\Book;
use App\Models\BookReport;
use Illuminate\Notifications\Messages\MailMessage;

/** Ke kreator: bukunya diturunkan karena laporan pelanggaran. */
class BookTakenDown extends AmaniaMailNotification
{
    public function __construct(public Book $book, public string $type, public string $note)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMessage('Buku Anda diturunkan: ' . str($this->book->title)->limit(50))
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line("Buku **{$this->book->title}** kami turunkan dari penjualan (status diubah menjadi Draf) setelah meninjau laporan " . strtolower(BookReport::TYPES[$this->type] ?? $this->type) . '.')
            ->line("Catatan tim: {$this->note}")
            ->line('Pembeli yang sudah membeli tetap dapat membaca. Bila Anda yakin laporan ini keliru, balas melalui WhatsApp admin dengan bukti kepemilikan atau izin penerbitan, sesuai Syarat & Ketentuan Kreator.')
            ->action('Buka Studio Kreator', $this->frontendUrl('kreator/buku'));
    }
}
