<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\Facades\URL;

class VerifyEmailNotification extends AmaniaMailNotification
{
    public function toMail(object $notifiable): MailMessage
    {
        // URL bertanda tangan menuju endpoint API, lalu diteruskan ke halaman
        // frontend yang akan memanggil endpoint tersebut (POST) dengan parameter yang sama.
        $signed = URL::temporarySignedRoute(
            'verification.verify',
            now()->addMinutes((int) config('auth.verification.expire', 60)),
            [
                'id' => $notifiable->getKey(),
                'hash' => sha1($notifiable->getEmailForVerification()),
            ]
        );

        parse_str((string) parse_url($signed, PHP_URL_QUERY), $query);

        $url = $this->frontendUrl('verifikasi-email') . '?' . http_build_query([
            'id' => $notifiable->getKey(),
            'hash' => sha1($notifiable->getEmailForVerification()),
            'expires' => $query['expires'] ?? '',
            'signature' => $query['signature'] ?? '',
        ]);

        return $this->baseMessage('Konfirmasi alamat email akun Srawung Anda')
            ->greeting('Selamat datang, ' . $this->firstName($notifiable))
            ->line('Terima kasih telah mendaftar di Srawung. Satu langkah lagi: konfirmasikan bahwa alamat email ini milik Anda.')
            ->action('Verifikasi Email', $url)
            ->line('Verifikasi memastikan notifikasi pesanan dan tautan pemulihan kata sandi selalu sampai ke kotak masuk Anda.')
            ->line('Jika Anda tidak membuat akun di Srawung, abaikan email ini.');
    }
}
