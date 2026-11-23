<?php

namespace App\Notifications;

use App\Models\Book;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Dikirim ke pemilik buku setelah PDF selesai dikonversi menjadi halaman — atau
 * gagal, beserta alasannya — supaya kreator/admin tidak perlu menunggu di layar.
 */
class BookProcessingFinished extends AmaniaMailNotification
{
    public function __construct(public Book $book)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $book = $this->book;
        $manage = $this->frontendUrl($book->creator_id ? 'kreator/buku' : 'admin/buku');
        $greeting = 'Halo, ' . (method_exists($notifiable, 'getAttribute') && $notifiable->getAttribute('name') ? strtok($notifiable->getAttribute('name'), ' ') : 'Admin');

        if ($book->processing_status === 'done') {
            $minutes = $book->processing_started_at && $book->processing_finished_at
                ? max(1, (int) ceil($book->processing_started_at->diffInSeconds($book->processing_finished_at) / 60))
                : null;
            $message = $this->baseMessage("Buku \u{201C}{$book->title}\u{201D} siap — {$book->total_pages} halaman")
                ->greeting($greeting)
                ->line("PDF buku **{$this->md($book->title)}** selesai diproses menjadi **{$book->total_pages} halaman**" . ($minutes ? " dalam ±{$minutes} menit" : '') . '.')
                ->line('Halaman sudah bertanda air dan siap dibaca pembeli. ' . ($book->status === 'published'
                    ? 'Buku ini berstatus **Terbit** dan sudah tampil di toko.'
                    : 'Buku masih berstatus **Draf** — ubah ke Terbit bila sudah siap dijual.'));
            if ($book->slug) {
                $message->action('Lihat halaman buku', $this->frontendUrl("buku/{$book->slug}"));
            }

            return $message->line("Kelola buku Anda di: {$manage}");
        }

        return $this->baseMessage("Konversi buku \u{201C}{$book->title}\u{201D} gagal")
            ->greeting($greeting)
            ->line("PDF buku **{$this->md($book->title)}** belum bisa diproses menjadi halaman.")
            ->line('**Alasan:** ' . ($book->processing_error ?: 'tidak diketahui'))
            ->line('Penyebab umum: file PDF rusak, dikunci kata sandi, atau bukan PDF asli. Coba simpan ulang PDF tanpa kata sandi, lalu unggah kembali.')
            ->action('Unggah ulang PDF', $manage)
            ->line('Halaman lama (bila ada) tetap utuh dan tetap bisa dibaca pembeli.');
    }
}
