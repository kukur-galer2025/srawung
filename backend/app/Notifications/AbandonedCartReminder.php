<?php

namespace App\Notifications;

use App\Services\EmailPreferences;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\HtmlString;

/**
 * Pengingat keranjang yang ditinggalkan (maks. 2 kali per isi keranjang).
 *
 * @property list<array<string, mixed>> $lines baris dari CartPricing::quote (yang tersedia saja)
 */
class AbandonedCartReminder extends AmaniaMailNotification
{
    /** @param list<array<string, mixed>> $lines */
    public function __construct(public array $lines, public int $subtotal, public int $sequence)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $first = $this->lines[0]['title'] ?? 'buku pilihan Anda';
        $count = count($this->lines);
        $hasSale = collect($this->lines)->contains(fn ($l) => ($l['on_sale'] ?? false) || $l['type'] === 'bundle');

        $subject = $this->sequence === 1
            ? ($count > 1 ? "{$count} buku masih menunggu di keranjang Anda" : 'Masih tertarik dengan "' . str($first)->before(':')->limit(45) . '"?')
            : ($hasSale ? 'Harga hemat di keranjang Anda belum berakhir' : 'Keranjang Anda masih tersimpan');

        $cell = fn (string $v) => e(str_replace(['|', "\r", "\n"], ['/', ' ', ' '], $v));
        $rows = ['| Buku | Harga |', '|:-----|-----:|'];
        foreach ($this->lines as $l) {
            $title = $l['type'] === 'bundle' ? 'Paket: ' . $l['title'] : $l['title'];
            $price = '**' . $this->rupiah($l['price']) . '**';
            if (($l['normal_price'] ?? 0) > $l['price']) {
                $price .= ' ~~' . $this->rupiah($l['normal_price']) . '~~';
            }
            $rows[] = '| ' . $cell((string) str($title)->limit(60)) . " | {$price} |";
        }
        $rows[] = '| **Total** | **' . $this->rupiah($this->subtotal) . '** |';

        return $this->baseMessage($subject)
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line($this->sequence === 1
                ? 'Buku yang Anda pilih masih tersimpan di keranjang. Selesaikan pesanan kapan saja — pembayaran cukup scan QRIS dari aplikasi bank atau e-wallet.'
                : 'Sekadar mengingatkan, keranjang Anda masih menunggu. Harga promo bisa berakhir sewaktu-waktu.')
            ->line(new HtmlString("<div class=\"table\">\n\n" . implode("\n", $rows) . "\n\n</div>"))
            ->action('Lanjutkan ke keranjang', $this->frontendUrl('keranjang'))
            ->line('Ada kendala saat checkout? Balas email ini atau hubungi admin lewat WhatsApp — kami siap membantu.')
            ->line(new HtmlString('<span style="font-size:12px;color:#64748b">Tidak ingin menerima pengingat keranjang & kabar promo wishlist? <a href="' . e(EmailPreferences::reminderUnsubscribeUrl($notifiable)) . '" style="color:#64748b">Matikan di sini</a>.</span>'));
    }
}
