<?php

namespace App\Notifications;

use App\Models\CreatorPayout;
use Illuminate\Notifications\Messages\MailMessage;

/** Ke admin: kreator mengajukan penarikan saldo. */
class PayoutRequested extends AmaniaMailNotification
{
    public function __construct(public CreatorPayout $payout)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $p = $this->payout->loadMissing('creator.creatorProfile');
        $name = $p->creator?->creatorProfile?->display_name ?? $p->creator?->name ?? 'Kreator';

        $net = $p->net_amount ?? $p->amount;

        return $this->baseMessage("Pengajuan penarikan {$this->rupiah($p->amount)} dari {$name}")
            ->greeting('Pengajuan penarikan kreator')
            ->line("**{$name}** mengajukan penarikan saldo sebesar **{$this->rupiah($p->amount)}**.")
            ->line("Biaya admin {$this->rupiah($p->fee)} → **transfer {$this->rupiah($net)}**.")
            ->line("Tujuan: {$p->payout_provider} · {$p->payout_account} a.n. {$p->payout_holder}")
            ->action('Proses penarikan', $this->frontendUrl('admin/kreator'))
            ->line('Setelah transfer, tandai "Sudah dibayar" dan lampirkan bukti transfer agar kreator menerima konfirmasi.');
    }
}
