<?php

namespace App\Notifications;

use App\Models\NewsletterCampaign;
use App\Models\NewsletterSubscriber;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Support\HtmlString;
use Symfony\Component\Mime\Email;

/** Satu edisi newsletter untuk satu pelanggan. */
class NewsletterIssue extends AmaniaMailNotification
{
    public function __construct(public NewsletterCampaign $campaign, public ?NewsletterSubscriber $subscriber = null)
    {
        parent::__construct();
    }

    public function toMail(object $notifiable): MailMessage
    {
        // Gambar dari editor dibuat responsif agar tidak melebar di layar HP.
        $body = str_replace('<img ', '<img style="max-width:100%;height:auto;border-radius:8px" ', $this->campaign->body);

        $mail = $this->baseMessage($this->campaign->subject);

        if ($this->campaign->preheader) {
            // Teks pratinjau di daftar kotak masuk (tersembunyi di badan email).
            $mail->line(new HtmlString('<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden">' . e($this->campaign->preheader) . '</span>'));
        }

        $mail->line(new HtmlString("<div>\n" . $body . "\n</div>"));

        $footer = $this->subscriber
            ? 'Anda menerima email ini karena berlangganan newsletter Srawung. <a href="' . e($this->subscriber->unsubscribeUrl()) . '" style="color:#64748b">Berhenti berlangganan</a>.'
            : 'Ini email uji coba newsletter — hanya dikirim ke admin.';
        $mail->line(new HtmlString('<span style="font-size:12px;color:#64748b">' . $footer . '</span>'));

        if ($this->subscriber) {
            $oneClick = $this->subscriber->oneClickUrl();
            $mail->withSymfonyMessage(function (Email $message) use ($oneClick) {
                // Tombol "Berhenti berlangganan" bawaan Gmail/Outlook (RFC 8058).
                $message->getHeaders()->addTextHeader('List-Unsubscribe', "<{$oneClick}>");
                $message->getHeaders()->addTextHeader('List-Unsubscribe-Post', 'List-Unsubscribe=One-Click');
            });
        }

        return $mail;
    }
}
