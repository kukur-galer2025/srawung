<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/** Pemberitahuan keamanan akun (login admin dari lokasi baru, sandi/rekening/QRIS diganti, 2FA dimatikan). */
class SecurityNotice extends AmaniaMailNotification
{
    /** @param list<string> $lines */
    public function __construct(public string $title, public array $lines)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = $this->baseMessage('[Keamanan Srawung] ' . $this->title)->greeting($this->title);
        foreach ($this->lines as $line) {
            $mail->line($this->md($line));
        }

        return $mail
            ->line('Bila ini memang Anda, abaikan email ini. **Bila bukan Anda**, segera ganti kata sandi lewat "Lupa sandi" (semua perangkat akan dikeluarkan) lalu hubungi admin.')
            ->action('Atur ulang kata sandi', $this->frontendUrl('lupa-sandi'));
    }
}
