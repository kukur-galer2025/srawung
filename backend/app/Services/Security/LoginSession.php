<?php

namespace App\Services\Security;

use App\Models\ReadingSession;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/** Satu pintu untuk menerbitkan & mencabut token login. */
class LoginSession
{
    /* ---------- Pembatas tebak kata sandi ---------- */

    private const PER_ACCOUNT_IP = 5;      // gagal per akun+IP / menit

    private const PER_ACCOUNT = 30;        // gagal per akun dari IP yang belum dikenal / jam

    /** Detik menunggu bila percobaan terlalu banyak, atau null bila boleh mencoba. */
    public static function lockedFor(string $email, Request $request, ?User $user): ?int
    {
        [$pair, $account] = self::keys($email, $request);
        if (RateLimiter::tooManyAttempts($pair, self::PER_ACCOUNT_IP)) {
            return RateLimiter::availableIn($pair);
        }
        // Pemilik akun di IP yang pernah berhasil login tidak ikut terkunci oleh serangan dari tempat lain.
        if (RateLimiter::tooManyAttempts($account, self::PER_ACCOUNT) && !($user && self::knowsIp($user, $request))) {
            return RateLimiter::availableIn($account);
        }

        return null;
    }

    public static function failed(string $email, Request $request, ?User $user): void
    {
        [$pair, $account] = self::keys($email, $request);
        RateLimiter::hit($pair, 60);
        if (RateLimiter::hit($account, 3600) === self::PER_ACCOUNT && $user) {
            SecurityLog::record('login.locked', $user);
            SecurityLog::notify($user, 'Banyak percobaan masuk yang gagal', ['Ada banyak percobaan masuk ke akun Anda dengan kata sandi yang salah. Percobaan berikutnya kami tahan sementara.']);
        }
        SecurityLog::record('login.failed', $user);
    }

    /** Selalu menghitung hash, juga untuk email yang tidak ada: waktu respons tidak membocorkan akun terdaftar. */
    public static function passwordMatches(?User $user, string $password): bool
    {
        $hash = $user?->password ?: Cache::rememberForever('login-dummy-hash', fn () => Hash::make(bin2hex(random_bytes(16))));
        $ok = Hash::check($password, $hash);

        return $ok && $user !== null && (bool) $user->password;
    }

    /* ---------- Penerbitan token ---------- */

    /** Balasan login: token, atau tantangan 2FA bila akun mengaktifkannya. @return array<string, mixed> */
    public static function begin(User $user, Request $request, string $via, string $message): array
    {
        if ($user->two_factor_enabled) {
            return ['two_factor' => true, 'challenge' => TwoFactor::challenge($user), 'message' => 'Masukkan kode dari aplikasi authenticator Anda.'];
        }

        return self::issue($user, $request, $via, $message);
    }

    /** @return array<string, mixed> */
    public static function issue(User $user, Request $request, string $via, string $message): array
    {
        RateLimiter::clear(self::keys($user->email, $request)[0]);

        $isNewIp = !self::knowsIp($user, $request);
        Cache::put(self::ipKey($user, $request), 1, now()->addDays(90));
        SecurityLog::record('login.success', $user, ['via' => $via, 'new_ip' => $isNewIp]);

        if ($isNewIp && in_array($user->role, ['admin', 'creator'], true)) {
            SecurityLog::notify($user, $user->role === 'admin' ? 'Login admin dari perangkat/jaringan baru' : 'Login kreator dari perangkat/jaringan baru', [
                "Akun {$user->email} baru saja masuk ke Srawung.",
                'Peramban: ' . mb_substr((string) $request->userAgent(), 0, 120),
            ]);
        }

        return ['message' => $message, 'user' => $user, 'token' => self::token($user)];
    }

    public static function token(User $user): string
    {
        $hours = (int) (config("amania.security.token_hours.{$user->role}") ?: config('amania.security.token_hours.buyer'));

        return $user->createToken('auth_token', ['*'], now()->addHours($hours))->plainTextToken;
    }

    /** Keluarkan semua perangkat (kecuali token yang sedang dipakai bila diberikan). */
    public static function revokeAll(User $user, int|string|null $exceptTokenId = null): void
    {
        $user->tokens()->when($exceptTokenId, fn ($q) => $q->where('id', '!=', $exceptTokenId))->delete();
        ReadingSession::where('user_id', $user->id)->where('is_active', true)->update(['is_active' => false, 'ended_reason' => 'security']);
    }

    /* ------------------------------------------------------------------ */

    private static function knowsIp(User $user, Request $request): bool
    {
        return Cache::has(self::ipKey($user, $request));
    }

    private static function ipKey(User $user, Request $request): string
    {
        return "known-ip:{$user->id}:" . hash('sha256', (string) $request->ip());
    }

    /** @return array{0: string, 1: string} */
    private static function keys(string $email, Request $request): array
    {
        $id = hash('sha256', strtolower(trim($email)));

        return ["login-pair:{$id}|" . $request->ip(), "login-account:{$id}"];
    }
}
