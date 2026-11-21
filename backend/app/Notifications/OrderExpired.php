<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Memberi tahu pembeli bahwa pesanannya kedaluwarsa karena batas waktu terlewat.
 */
class OrderExpired extends AmaniaMailNotification
{
    use OrderSummary;

    public function __construct(public Order $order)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('orderItems.book');

        return $this->baseMessage("Pesanan {$order->order_number} telah kedaluwarsa")
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line("Batas waktu pembayaran pesanan **{$order->order_number}** telah berakhir, sehingga pesanan ini dibatalkan otomatis.")
            ->line($this->orderTable($order))
            ->line('Masih ingin membaca buku-buku ini? Anda bisa memesannya lagi kapan saja.')
            ->action('Lihat Katalog', $this->frontendUrl('buku'))
            ->line('**Sudah terlanjur membayar?** Hubungi admin melalui WhatsApp yang tertera di halaman pembayaran dengan menyertakan nomor pesanan dan bukti pembayaran. Kami akan membantu.');
    }
}
