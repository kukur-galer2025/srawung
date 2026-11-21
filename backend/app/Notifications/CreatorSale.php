<?php

namespace App\Notifications;

use App\Models\CreatorEarning;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\HtmlString;

/** Ke kreator: bukunya terjual (setelah pembayaran dikonfirmasi). */
class CreatorSale extends AmaniaMailNotification
{
    /** @param list<CreatorEarning> $earnings */
    public function __construct(public array $earnings)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $items = collect($this->earnings)->each->loadMissing('book');
        $net = (int) $items->sum('net');
        $first = $items->first()?->book?->title ?? 'Buku Anda';

        $cell = fn (string $v) => e(str_replace(['|', "\r", "\n"], ['/', ' ', ' '], $v));
        $rows = ['| Buku | Untuk Anda |', '|:-----|-----:|'];
        foreach ($items as $e) {
            $rows[] = '| ' . $cell((string) str($e->book?->title ?? 'Buku')->limit(55)) . ' | ' . $this->rupiah($e->net) . ' |';
        }

        return $this->baseMessage($items->count() > 1 ? "{$items->count()} buku Anda terjual" : 'Terjual: "' . str($first)->limit(50) . '"')
            ->greeting('Selamat, ' . $this->firstName($notifiable) . '!')
            ->line('Pembayaran pembeli sudah dikonfirmasi. Pendapatan Anda (setelah komisi Srawung) sudah masuk ke saldo:')
            ->line(new HtmlString("<div class=\"table\">\n\n" . implode("\n", $rows) . "\n\n</div>"))
            ->line('Total masuk saldo: **' . $this->rupiah($net) . '**')
            ->action('Lihat pendapatan', $this->frontendUrl('kreator/pendapatan'));
    }
}
