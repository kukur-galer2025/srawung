<?php

namespace App\Notifications;

use App\Models\NewsletterSubscriber;
use Illuminate\Notifications\Messages\MailMessage;

/** Double opt-in: memastikan pemilik email benar-benar ingin berlangganan. */
class NewsletterConfirm extends AmaniaMailNotification
{
    public function __construct(public NewsletterSubscriber $subscriber)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        return $this->baseMessage('Konfirmasi langganan newsletter Srawung')
            ->greeting('Satu langkah lagi')
            ->line('Klik tombol di bawah untuk mulai menerima kabar buku baru, promo, dan artikel pilihan dari Srawung — maksimal beberapa email per bulan.')
            ->action('Ya, saya mau berlangganan', $this->frontendUrl('newsletter/konfirmasi?token=' . $this->subscriber->token))
            ->line('Tidak merasa mendaftar? Abaikan saja email ini — Anda tidak akan dikirimi apa pun.');
    }
}
