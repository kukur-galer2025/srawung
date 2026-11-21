<?php

namespace App\Jobs;

use App\Models\NewsletterCampaign;
use App\Models\NewsletterSubscriber;
use App\Notifications\NewsletterIssue;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Notification;

/**
 * Antrekan satu email per pelanggan. Pengiriman disebar (jeda bertahap) agar
 * tidak menabrak batas SMTP — Gmail misalnya ±500 email/hari.
 */
class SendNewsletterCampaign implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 600;

    public function __construct(public int $campaignId) {}

    public function handle(): void
    {
        $campaign = NewsletterCampaign::find($this->campaignId);
        if (!$campaign || $campaign->status !== 'sending') {
            return;
        }

        $perMinute = max(1, (int) config('mail.newsletter_per_minute', 20));
        $i = 0;
        NewsletterSubscriber::where('status', NewsletterSubscriber::SUBSCRIBED)
            ->orderBy('id')
            ->chunkById(200, function ($subs) use ($campaign, $perMinute, &$i) {
                foreach ($subs as $sub) {
                    $delay = now()->addSeconds((int) floor($i / $perMinute) * 60);
                    Notification::route('mail', $sub->email)
                        ->notify((new NewsletterIssue($campaign, $sub))->delay($delay));
                    $i++;
                }
            });

        $campaign->update(['status' => 'sent', 'sent_at' => now(), 'recipients_count' => $i]);
    }
}
