<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Notifications\Messages\MailMessage;

class OrderRejected extends AmaniaMailNotification
{
    use OrderSummary;

    public function __construct(public Order $order, public string $reason)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('orderItems.book');
        $reason = trim(preg_replace('/\s+/', ' ', $this->reason));

        return $this->baseMessage("Bukti pembayaran pesanan {$order->order_number} perlu diperbarui")
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line("Mohon maaf, bukti pembayaran untuk pesanan **{$order->order_number}** belum dapat kami verifikasi.")
            ->line("> **Catatan dari admin:** {$reason}")
            ->line('Silakan unggah ulang bukti pembayaran yang sesuai (pastikan nominal, tanggal, dan nama merchant terlihat jelas)'
                . ($order->payment_deadline ? " sebelum **{$this->wib($order->payment_deadline)}**. Setelah itu pesanan otomatis kedaluwarsa." : '.'))
            ->action('Unggah Ulang Bukti', $this->frontendUrl('pesanan/' . rawurlencode($order->order_number) . '/bayar'))
            ->line('Jika Anda merasa ini keliru, balas melalui WhatsApp admin yang tertera di halaman pembayaran.');
    }
}
