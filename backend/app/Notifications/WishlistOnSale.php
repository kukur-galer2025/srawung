<?php

namespace App\Notifications;

use App\Models\Book;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\HtmlString;

/**
 * Email ke pembaca saat buku di wishlist-nya sedang promo (satu email berisi semua buku).
 */
class WishlistOnSale extends AmaniaMailNotification
{
    /** @param list<int> $bookIds */
    public function __construct(public array $bookIds)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $books = Book::whereIn('id', $this->bookIds)->get();
        $first = $books->first();
        $subject = $books->count() > 1
            ? "{$books->count()} buku di wishlist Anda sedang promo"
            : 'Promo: "' . str($first?->title)->before(':')->limit(50) . '" turun harga';

        $cell = fn (string $v) => e(str_replace(['|', "\r", "\n"], ['/', ' ', ' '], $v));
        $lines = ['| Buku | Harga promo | Berlaku |', '|:-----|:-----|:-----|'];
        foreach ($books as $b) {
            $ends = $b->sale_ends_at ? 's.d. ' . $this->wib($b->sale_ends_at) : 'waktu terbatas';
            $lines[] = '| ' . $cell((string) str($b->title)->limit(48)) . ' | **' . $this->rupiah($b->currentPrice()) . '** ~~' . $this->rupiah($b->price) . "~~ (-{$b->discount_percent}%) | {$ends} |";
        }

        $message = $this->baseMessage($subject)
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line('Kabar baik! Buku yang Anda simpan di wishlist sedang turun harga:')
            ->line(new HtmlString("<div class=\"table\">\n\n" . implode("\n", $lines) . "\n\n</div>"));

        return $message
            ->action($books->count() > 1 ? 'Lihat Wishlist Saya' : 'Lihat Buku', $books->count() > 1 ? $this->frontendUrl('wishlist') : $this->frontendUrl('buku/' . $first?->slug))
            ->line('Harga promo terkunci saat pesanan dibuat, jadi segera checkout sebelum promo berakhir.')
            ->line(new HtmlString('<span style="font-size:12px;color:#64748b">Anda menerima email ini karena menyimpan buku di wishlist Srawung. Tidak ingin menerima kabar promo & pengingat keranjang? <a href="' . e(\App\Services\EmailPreferences::reminderUnsubscribeUrl($notifiable)) . '" style="color:#64748b">Matikan di sini</a>.</span>'));
    }
}
