<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\HtmlString;

/** Ke kreator: pendapatan dari sebuah pesanan dikoreksi karena pesanan di-refund. */
class CreatorSaleReversed extends AmaniaMailNotification
{
    /** @param list<array{title: string, net: int}> $items */
    public function __construct(public string $orderNumber, public array $items, public string $reason)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $total = array_sum(array_column($this->items, 'net'));
        $list = implode('', array_map(fn ($i) => '<li>' . e($i['title']) . ' — ' . e($this->rupiah($i['net'])) . '</li>', $this->items));

        return $this->baseMessage('Koreksi pendapatan: ' . $this->rupiah($total))
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line("Pesanan **{$this->orderNumber}** dikembalikan dananya kepada pembeli, sehingga pendapatan Anda dari pesanan tersebut dikoreksi sebesar **{$this->rupiah($total)}**:")
            ->line(new HtmlString('<ul style="margin:0 0 12px 18px;padding:0">' . $list . '</ul>'))
            ->line("Alasan: {$this->reason}")
            ->line('Bila saldo tersebut sudah Anda tarik, selisihnya akan otomatis dipotong dari penjualan berikutnya, sesuai Syarat & Ketentuan Kreator.')
            ->action('Lihat pendapatan', $this->frontendUrl('kreator/pendapatan'));
    }
}
