<?php

namespace App\Notifications;

use App\Models\Order;
use App\Models\PaymentProof;
use Illuminate\Notifications\Messages\MailMessage;

/**
 * Dikirim ke email admin setiap kali pembeli mengunggah (ulang) bukti pembayaran QRIS.
 */
class NewPaymentProofForAdmin extends AmaniaMailNotification
{
    use OrderSummary;

    public function __construct(public Order $order, public PaymentProof $proof)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $order = $this->order->loadMissing(['orderItems.book', 'user']);
        $buyer = $order->user;
        $isReupload = $order->paymentProofs()->count() > 1;

        $message = $this->baseMessage(
            ($isReupload ? 'Bukti bayar diunggah ulang' : 'Bukti bayar baru') . ": {$order->order_number} · {$this->rupiah($order->total)}"
        )
            ->greeting($isReupload ? 'Bukti pembayaran diunggah ulang' : 'Ada bukti pembayaran baru')
            ->line("**{$buyer?->name}** ({$buyer?->email}" . ($buyer?->whatsapp ? ", WA {$buyer->whatsapp}" : '') . ") mengunggah bukti pembayaran untuk pesanan **{$order->order_number}**.")
            ->line("Cocokkan mutasi QRIS dengan nominal **{$this->rupiah($order->total)}** dan bukti yang diunggah.")
            ->line($this->orderTable($order));

        // Peringatan dari pemeriksa bukti (bukti dipakai ulang, akun baru, dll.).
        $check = \App\Services\ProofInspector::summary($this->proof);
        if ($check['flags']) {
            $lines = array_map(fn ($f) => '- ' . (\App\Services\ProofInspector::FLAG_LABELS[$f] ?? $f), $check['flags']);
            if ($m = $check['match']) {
                $lines[] = "- Mirip {$m['similarity']}% dengan bukti pesanan **{$m['order_number']}** ({$m['buyer_name']}, status: {$m['order_status']})";
            }
            $message->line("**⚠️ Perlu dicek lebih teliti:**\n" . implode("\n", $lines));
        }

        if ($this->proof->buyer_note) {
            $note = trim(preg_replace('/\s+/', ' ', $this->proof->buyer_note));
            $message->line("> **Catatan pembeli:** {$note}");
        }

        return $message
            ->action('Periksa & Verifikasi', $this->frontendUrl('admin/pesanan?order=' . $order->id))
            ->line('Pembeli akan otomatis menerima email setelah pesanan dikonfirmasi atau ditolak.');
    }
}
