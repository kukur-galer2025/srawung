<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Notifications\Messages\MailMessage;

/** Ke pembeli: dana pesanannya dikembalikan. */
class OrderRefunded extends AmaniaMailNotification
{
    use OrderSummary;

    public function __construct(public Order $order, public bool $accessRevoked)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $o = $this->order->loadMissing('orderItems.book');
        $mail = $this->baseMessage("Dana pesanan {$o->order_number} telah dikembalikan")
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line("Dana pesanan **{$o->order_number}** sebesar **{$this->rupiah($o->total)}** telah kami kembalikan.")
            ->line("Alasan: {$o->refund_reason}");

        if ($o->refund_reference) {
            $mail->line("No. referensi transfer: **{$o->refund_reference}**");
        }

        return $mail
            ->line($this->orderTable($o))
            ->line($this->accessRevoked
                ? 'Karena dananya dikembalikan, akses baca buku dari pesanan ini sudah tidak aktif.'
                : 'Akses baca buku dari pesanan ini tetap aktif.')
            ->action('Lihat pesanan saya', $this->frontendUrl('pesanan'))
            ->line('Bila dana belum masuk dalam 1×24 jam, balas melalui WhatsApp admin dengan menyebutkan nomor pesanan.');
    }
}
