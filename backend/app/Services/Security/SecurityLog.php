<?php

namespace App\Services\Security;

use App\Models\User;
use App\Notifications\SecurityNotice;
use App\Services\OrderLifecycle;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;

/**
 * Jejak keamanan: storage/logs/security-YYYY-MM-DD.log (90 hari) + email untuk kejadian penting.
 */
class SecurityLog
{
    /** @param array<string, scalar|null> $context */
    public static function record(string $event, ?User $user = null, array $context = []): void
    {
        try {
            $request = app()->runningInConsole() && !app()->runningUnitTests() ? null : request();
            Log::channel(app()->runningUnitTests() ? 'null' : 'security')->info($event, [
                'user_id' => $user?->id,
                'role' => $user?->role,
                'ip' => $request?->ip(),
                'agent' => $request ? mb_substr((string) $request->userAgent(), 0, 180) : null,
                ...$context,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /** Beri tahu pemilik akun lewat email. @param list<string> $lines */
    public static function notify(User $user, string $title, array $lines): void
    {
        try {
            $user->notify(new SecurityNotice($title, self::withOrigin($lines)));
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * Beri tahu SEMUA admin + alamat notifikasi (termasuk alamat lama bila baru saja diganti),
     * agar penyerang yang menguasai satu akun tidak bisa membungkam peringatannya.
     *
     * @param list<string> $lines
     * @param list<string|null> $extraEmails
     */
    public static function notifyAdmins(string $title, array $lines, array $extraEmails = []): void
    {
        $emails = User::where('role', 'admin')->where('is_blocked', false)->pluck('email')
            ->merge([OrderLifecycle::adminEmail()])->merge($extraEmails)
            ->filter(fn ($e) => filter_var($e, FILTER_VALIDATE_EMAIL))
            ->map(fn ($e) => strtolower($e))->unique();

        foreach ($emails as $email) {
            try {
                Notification::route('mail', $email)->notify(new SecurityNotice($title, self::withOrigin($lines)));
            } catch (\Throwable $e) {
                report($e);
            }
        }
    }

    /** @param list<string> $lines @return list<string> */
    private static function withOrigin(array $lines): array
    {
        $ip = request()?->ip();

        return $ip ? [...$lines, "Alamat IP: {$ip}", 'Waktu: ' . now()->timezone('Asia/Jakarta')->locale('id')->translatedFormat('d F Y, H:i') . ' WIB'] : $lines;
    }
}
