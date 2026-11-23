<?php

namespace App\Services;

use App\Models\NewsletterSubscriber;
use App\Models\User;
use App\Notifications\NewsletterConfirm;
use Illuminate\Support\Facades\Notification;

/**
 * Persetujuan email pemasaran:
 *  - Newsletter: double opt-in (konfirmasi lewat email), kecuali pengguna yang
 *    login dengan email terverifikasi.
 *  - Pengingat (keranjang tertinggal, promo wishlist): aktif bawaan karena dipicu
 *    tindakan pengguna sendiri; bisa dimatikan satu klik dari setiap email.
 */
class EmailPreferences
{
    public static function reminderToken(User $user): string
    {
        return substr(hash_hmac('sha256', "reminders|{$user->id}|{$user->email}", (string) config('app.key')), 0, 40);
    }

    public static function reminderUnsubscribeUrl(User $user): string
    {
        return config('app.frontend_url') . "/email/berhenti?u={$user->id}&t=" . self::reminderToken($user);
    }

    /** @return array{status: string, subscriber: NewsletterSubscriber} */
    public static function subscribe(string $email, ?User $user, string $source): array
    {
        $email = strtolower(trim($email));
        $sub = NewsletterSubscriber::firstOrNew(['email' => $email]);
        if (!$sub->exists) {
            $sub->token = NewsletterSubscriber::newToken();
        }
        $sub->user_id ??= ($user && strtolower($user->email) === $email) ? $user->id : User::where('email', $email)->value('id');
        $sub->source ??= $source;

        if ($sub->status === NewsletterSubscriber::SUBSCRIBED) {
            $sub->save();
            return ['status' => 'already', 'subscriber' => $sub];
        }

        // Pemilik akun yang emailnya sudah terverifikasi tidak perlu konfirmasi ulang.
        $verifiedOwner = $user && strtolower($user->email) === $email && $user->hasVerifiedEmail();
        if ($verifiedOwner) {
            $sub->fill(['status' => NewsletterSubscriber::SUBSCRIBED, 'confirmed_at' => now(), 'unsubscribed_at' => null])->save();
            return ['status' => 'subscribed', 'subscriber' => $sub];
        }

        $sub->fill(['status' => NewsletterSubscriber::PENDING, 'unsubscribed_at' => null])->save();
        // Maksimal 3 email konfirmasi per alamat per hari (formulir publik, jangan bisa membanjiri orang lain).
        \Illuminate\Support\Facades\RateLimiter::attempt('newsletter-mail:' . hash('sha256', $email), 3, function () use ($email, $sub) {
            try {
                Notification::route('mail', $email)->notify(new NewsletterConfirm($sub));
            } catch (\Throwable $e) {
                report($e);
            }
        }, 86400);

        return ['status' => 'pending', 'subscriber' => $sub];
    }

    public static function unsubscribe(NewsletterSubscriber $sub): void
    {
        $sub->fill(['status' => NewsletterSubscriber::UNSUBSCRIBED, 'unsubscribed_at' => now()])->save();
    }

    public static function newsletterStatus(User $user): string
    {
        return NewsletterSubscriber::where('email', strtolower($user->email))->value('status') ?? 'none';
    }
}
