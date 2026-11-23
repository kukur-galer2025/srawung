<?php

namespace App\Notifications;

use Illuminate\Notifications\Messages\MailMessage;

/**
 * Peringatan operasional untuk admin. Selalu dikirim dengan notifyNow() (sinkron),
 * karena masalah yang dilaporkan bisa jadi justru queue worker yang mati.
 */
class SystemAlert extends AmaniaMailNotification
{
    /** @param array<string, string> $problems */
    public function __construct(
        public string $title,
        public array $problems,
        public string $hint,
    ) {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        $mail = $this->baseMessage('[Srawung] ' . $this->title)
            ->greeting($this->title)
            ->line('Waktu: ' . now()->timezone('Asia/Jakarta')->translatedFormat('d M Y H:i') . ' WIB');

        foreach ($this->problems as $problem) {
            $mail->line('• ' . $this->md($problem));
        }

        return $mail
            ->line($this->hint)
            ->action('Buka status sistem', $this->frontendUrl('admin/pengaturan'));
    }
}
