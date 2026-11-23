<?php

namespace App\Services\Security;

use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;

/**
 * Verifikasi dua langkah (2FA) untuk admin & kreator: setelah kata sandi/Google benar,
 * login baru selesai bila kode dari aplikasi authenticator (atau kode pemulihan) benar.
 */
class TwoFactor
{
    private const CHALLENGE_SECONDS = 300;

    private const MAX_ATTEMPTS = 5;

    public static function allowedFor(User $user): bool
    {
        return in_array($user->role, ['admin', 'creator'], true);
    }

    /** Siapkan rahasia baru (belum aktif sampai kode pertama dikonfirmasi). */
    public static function start(User $user): string
    {
        $secret = Totp::generateSecret();
        $user->forceFill(['two_factor_secret' => $secret, 'two_factor_confirmed_at' => null, 'two_factor_last_step' => null, 'two_factor_recovery' => null])->save();

        return $secret;
    }

    /** @return list<string>|null kode pemulihan (hanya ditampilkan sekali), null bila kode salah */
    public static function confirm(User $user, string $code): ?array
    {
        if (!$user->two_factor_secret || $user->two_factor_enabled) {
            return null;
        }
        $step = Totp::match($user->two_factor_secret, $code);
        if ($step === null) {
            return null;
        }
        $codes = array_map(fn () => Str::upper(Str::random(5)) . '-' . Str::upper(Str::random(5)), range(1, 8));
        $user->forceFill([
            'two_factor_confirmed_at' => now(),
            'two_factor_last_step' => $step,
            'two_factor_recovery' => array_map(fn ($c) => hash('sha256', $c), $codes),
        ])->save();

        return $codes;
    }

    public static function disable(User $user): void
    {
        $user->forceFill(['two_factor_secret' => null, 'two_factor_recovery' => null, 'two_factor_confirmed_at' => null, 'two_factor_last_step' => null])->save();
    }

    /** Cek kode authenticator / kode pemulihan. Setiap kode hanya berlaku sekali. */
    public static function verify(User $user, string $code): bool
    {
        $key = "2fa-user:{$user->id}";
        if (RateLimiter::tooManyAttempts($key, 10)) {
            return false;
        }
        RateLimiter::hit($key, 900);

        $ok = DB::transaction(function () use ($user, $code) {
            $fresh = User::whereKey($user->id)->lockForUpdate()->first();
            if (!$fresh?->two_factor_enabled || !$fresh->two_factor_secret) {
                return false;
            }
            $code = strtoupper(preg_replace('/\s+/', '', $code));
            $step = Totp::match($fresh->two_factor_secret, $code, $fresh->two_factor_last_step);
            if ($step !== null) {
                $fresh->forceFill(['two_factor_last_step' => $step])->save();

                return true;
            }
            $hashes = $fresh->two_factor_recovery ?? [];
            $left = array_values(array_filter($hashes, fn ($h) => !hash_equals($h, hash('sha256', $code))));
            if (count($left) < count($hashes)) {
                $fresh->forceFill(['two_factor_recovery' => $left])->save();

                return true;
            }

            return false;
        });

        if ($ok) {
            RateLimiter::clear($key);
        }

        return $ok;
    }

    /* ---------- Tantangan saat login ---------- */

    public static function challenge(User $user): string
    {
        $token = Str::random(64);
        Cache::put(self::key($token), ['user_id' => $user->id, 'left' => self::MAX_ATTEMPTS], self::CHALLENGE_SECONDS);

        return $token;
    }

    /** Pengguna pemilik tantangan bila kodenya benar; tantangan hangus setelah berhasil atau 5× salah. */
    public static function solve(string $token, string $code): ?User
    {
        $data = Cache::get(self::key($token));
        $user = $data ? User::find($data['user_id']) : null;
        if (!$user || $user->is_blocked) {
            return null;
        }
        if (self::verify($user, $code)) {
            // pull: hanya satu permintaan yang bisa menukar tantangan ini.
            return Cache::pull(self::key($token)) ? $user : null;
        }
        if (--$data['left'] <= 0) {
            Cache::forget(self::key($token));
        } else {
            Cache::put(self::key($token), $data, self::CHALLENGE_SECONDS);
        }

        return null;
    }

    private static function key(string $token): string
    {
        return '2fa-challenge:' . hash('sha256', $token);
    }
}
