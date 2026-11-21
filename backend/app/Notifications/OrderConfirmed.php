<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Notifications\Messages\MailMessage;

class OrderConfirmed extends AmaniaMailNotification
{
    use OrderSummary;

    public function __construct(public Order $order)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('orderItems.book');
        $count = $order->orderItems->count();

        $message = $this->baseMessage("Pembayaran dikonfirmasi — pesanan {$order->order_number} siap dibaca")
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line("Pembayaran untuk pesanan **{$order->order_number}** telah **dikonfirmasi** pada {$this->wib($order->confirmed_at)}.")
            ->line("{$count} buku kini sudah aktif di perpustakaan Anda dan bisa dibaca kapan saja, di perangkat apa pun.")
            ->line($this->orderTable($order))
            ->action('Buka Perpustakaan Saya', $this->frontendUrl('perpustakaan'));

        return $message
            ->line('Invoice lunas terlampir dalam email ini (PDF), dan selalu bisa diunduh lagi dari halaman Pesanan.')
            ->line('Terima kasih telah berbelanja di Srawung. Selamat membaca!')
            ->attachData(\App\Services\InvoicePdf::render($order), \App\Services\InvoicePdf::filename($order), ['mime' => 'application/pdf']);
    }
}
