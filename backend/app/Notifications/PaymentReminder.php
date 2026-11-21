<?php

namespace App\Notifications;

use App\Models\Order;
use App\Services\PaymentInfo;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Pengingat ke pembeli beberapa jam sebelum batas waktu pembayaran / unggah ulang.
 */
class PaymentReminder extends AmaniaMailNotification
{
    use OrderSummary;

    public function __construct(public Order $order)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing('orderItems.book');
        $rejected = $order->status === 'ditolak';
        $deadline = $this->wib($order->payment_deadline);

        $message = $this->baseMessage(
            $rejected
                ? "Pengingat: unggah ulang bukti pesanan {$order->order_number} sebelum {$deadline}"
                : "Pengingat: selesaikan pembayaran pesanan {$order->order_number} sebelum {$deadline}"
        )
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line(
                $rejected
                    ? "Bukti pembayaran pesanan **{$order->order_number}** sebelumnya belum dapat kami verifikasi. Unggah ulang bukti yang sesuai sebelum **{$deadline}** agar pesanan tidak kedaluwarsa."
                    : "Pesanan **{$order->order_number}** masih menunggu pembayaran. Selesaikan pembayaran via QRIS dan unggah buktinya sebelum **{$deadline}** agar pesanan tidak kedaluwarsa."
            );

        if (!$rejected) {
            $message
                ->line('**Cara bayar:** buka halaman pembayaran, pindai QRIS **' . PaymentInfo::get()['merchant_name'] . '** dengan aplikasi bank atau e-wallet apa pun.')
                ->line("**Nominal yang harus dibayar:** {$this->rupiah($order->total)}");
        }

        return $message
            ->line($this->orderTable($order))
            ->action($rejected ? 'Unggah Ulang Bukti' : 'Bayar & Unggah Bukti', $this->frontendUrl('pesanan/' . rawurlencode($order->order_number) . '/bayar'))
            ->line('Abaikan email ini jika Anda sudah mengunggah bukti pembayaran.');
    }
}
