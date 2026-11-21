<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;
use Illuminate\Support\Carbon;
use Symfony\Component\Mime\Email;

/**
 * Dasar semua email transaksional Srawung.
 *
 * - Dikirim lewat antrean (queue) agar request API tidak menunggu SMTP Gmail,
 *   dan otomatis dicoba ulang bila SMTP sedang gagal.
 * - afterCommit: email baru dikirim setelah transaksi DB sukses, sehingga tidak
 *   ada email "pesanan dikonfirmasi" untuk transaksi yang ternyata di-rollback.
 * - Header standar email otomatis (RFC 3834) supaya auto-reply/out-of-office
 *   tidak membalas, dan klien email mengenalinya sebagai email transaksional.
 */
abstract class AmaniaMailNotification extends Notification implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    /** @var array<int, int> detik jeda antar percobaan ulang */
    public array $backoff = [30, 120];

    public function __construct()
    {
        $this->afterCommit();
    }

    public function via(object $notifiable): array
    {
        return ['mail'];
    }

    protected function baseMessage(string $subject): MailMessage
    {
        return (new MailMessage)
            ->subject($subject)
            ->withSymfonyMessage(function (Email $message) {
                $headers = $message->getHeaders();
                $headers->addTextHeader('Auto-Submitted', 'auto-generated');
                $headers->addTextHeader('X-Auto-Response-Suppress', 'OOF, AutoReply');
            });
    }

    protected function frontendUrl(string $path = ''): string
    {
        return config('app.frontend_url') . '/' . ltrim($path, '/');
    }

    protected function rupiah(int|float|null $amount): string
    {
        return 'Rp ' . number_format((float) $amount, 0, ',', '.');
    }

    protected function wib(?Carbon $date): string
    {
        if (!$date) {
            return '-';
        }

        return $date->copy()->timezone('Asia/Jakarta')->locale('id')->translatedFormat('d F Y, H:i') . ' WIB';
    }

    protected function firstName(object $notifiable): string
    {
        $name = trim((string) ($notifiable->name ?? ''));

        return $name === '' ? 'Pembaca' : explode(' ', $name)[0];
    }
}
