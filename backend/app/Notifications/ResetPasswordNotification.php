<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

class ResetPasswordNotification extends AmaniaMailNotification
{
    public function __construct(public string $token)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $url = $this->frontendUrl('reset-sandi') . '?' . http_build_query([
            'token' => $this->token,
            'email' => $notifiable->getEmailForPasswordReset(),
        ]);

        $expire = (int) config('auth.passwords.' . config('auth.defaults.passwords') . '.expire', 60);

        return $this->baseMessage('Atur ulang kata sandi akun Srawung Anda')
            ->greeting('Halo, ' . $this->firstName($notifiable))
            ->line('Kami menerima permintaan untuk mengatur ulang kata sandi akun Srawung yang terhubung dengan email ini.')
            ->line('Klik tombol di bawah untuk membuat kata sandi baru:')
            ->action('Buat Kata Sandi Baru', $url)
            ->line("Tautan ini hanya berlaku selama {$expire} menit dan hanya dapat digunakan satu kali.")
            ->line('Jika Anda tidak merasa meminta reset kata sandi, abaikan saja email ini. Kata sandi Anda tetap aman dan tidak berubah.');
    }
}
