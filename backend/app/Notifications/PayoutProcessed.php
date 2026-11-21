<?php

namespace App\Notifications;

use App\Models\CreatorPayout;
use Illuminate\Notifications\Messages\MailMessage;

/** Ke kreator: penarikan dibayar / ditolak. */
class PayoutProcessed extends AmaniaMailNotification
{
    public function __construct(public CreatorPayout $payout)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $p = $this->payout;
        $mail = $this->baseMessage($p->status === 'paid'
            ? "Penarikan {$this->rupiah($p->net_amount ?? $p->amount)} sudah ditransfer"
            : 'Pengajuan penarikan Anda ditolak')
            ->greeting('Halo, ' . $this->firstName($notifiable));

        if ($p->status === 'paid') {
            $mail->line("Dana sebesar **{$this->rupiah($p->net_amount ?? $p->amount)}** sudah ditransfer ke {$p->payout_provider} · {$p->payout_account} a.n. {$p->payout_holder} pada {$this->wib($p->processed_at)}.");
            if ($p->fee) {
                $mail->line("Rincian: penarikan {$this->rupiah($p->amount)} − biaya admin {$this->rupiah($p->fee)}.");
            }
            if ($p->reference) {
                $mail->line("No. referensi: **{$p->reference}**");
            }
        } else {
            $mail->line("Pengajuan penarikan **{$this->rupiah($p->amount)}** tidak dapat diproses.")
                ->line("Alasan: {$p->note}")
                ->line('Saldo sudah kembali dan bisa diajukan ulang setelah data diperbaiki.');
        }

        return $mail->action('Buka dashboard kreator', $this->frontendUrl('kreator/pendapatan'));
    }
}
