<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Dikirim ke email admin setiap ada pesanan baru (sebelum dibayar).
 * Email kedua menyusul saat pembeli mengunggah bukti bayar (NewPaymentProofForAdmin).
 */
class NewOrderForAdmin extends AmaniaMailNotification
{
    use OrderSummary;

    public function __construct(public Order $order)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing(['orderItems.book', 'user']);
        $buyer = $order->user;
        $count = $order->orderItems->count();

        $message = $this->baseMessage("Pesanan baru: {$order->order_number} · {$this->rupiah($order->total)}")
            ->greeting('Ada pesanan baru')
            ->line("**{$buyer?->name}** ({$buyer?->email}" . ($buyer?->whatsapp ? ", WA {$buyer->whatsapp}" : '') . ") membuat pesanan **{$order->order_number}** berisi {$count} buku.");

        $status = $order->status === 'dikonfirmasi'
            ? 'Pesanan gratis (Rp0) — **langsung aktif**, tidak perlu verifikasi.'
            : "Status: **menunggu pembayaran** — batas bayar {$this->wib($order->payment_deadline)}. Anda akan menerima email lagi saat pembeli mengunggah bukti bayar QRIS.";

        return $message
            ->line($this->orderTable($order))
            ->line($status)
            ->action('Lihat pesanan', $this->frontendUrl('admin/pesanan?order=' . $order->id));
    }
}
