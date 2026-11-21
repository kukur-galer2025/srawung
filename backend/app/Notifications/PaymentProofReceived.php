<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Notifications\Messages\MailMessage;

class PaymentProofReceived extends AmaniaMailNotification
{
    use OrderSummary;

    public function __construct(public Order $order)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('orderItems.book');

        return $this->baseMessage("Bukti pembayaran pesanan {$order->order_number} telah kami terima")
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line("Terima kasih! Bukti pembayaran untuk pesanan **{$order->order_number}** sudah berhasil diunggah dan sedang menunggu verifikasi tim kami.")
            ->line($this->orderTable($order))
            ->line('Verifikasi biasanya selesai dalam **1×24 jam** pada hari kerja. Kami akan mengirim email lagi segera setelah pembayaran dikonfirmasi, dan buku akan langsung muncul di perpustakaan Anda.')
            ->action('Lihat Status Pesanan', $this->frontendUrl('pesanan'))
            ->line('Simpan email ini sebagai tanda terima unggahan bukti pembayaran Anda.');
    }
}
