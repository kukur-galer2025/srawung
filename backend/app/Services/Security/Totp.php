<?php

namespace App\Services\Security;

/**
 * Kode sekali pakai berbasis waktu (RFC 6238, SHA-1, 6 angka, 30 detik) — cocok dengan
 * Google Authenticator, Microsoft Authenticator, Authy, 1Password, dan lainnya.
 */
class Totp
{
    public const PERIOD = 30;

    private const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

    public static function generateSecret(): string
    {
        return self::base32(random_bytes(20));
    }

    public static function step(?int $time = null): int
    {
        return intdiv($time ?? now()->getTimestamp(), self::PERIOD);
    }

    public static function code(string $secret, int $step): string
    {
        $hash = hash_hmac('sha1', pack('J', $step), self::decode($secret), true);
        $offset = ord($hash[19]) & 0x0F;
        $value = unpack('N', substr($hash, $offset, 4))[1] & 0x7FFFFFFF;

        return str_pad((string) ($value % 1_000_000), 6, '0', STR_PAD_LEFT);
    }

    /**
     * Langkah waktu yang cocok (toleransi ±30 detik), atau null. Langkah yang sudah
     * dipakai ($lastStep) atau lebih lama ditolak.
     */
    public static function match(string $secret, string $code, ?int $lastStep = null): ?int
    {
        if (!preg_match('/^\d{6}$/', $code)) {
            return null;
        }
        $now = self::step();
        foreach ([0, -1, 1] as $drift) {
            $step = $now + $drift;
            if (($lastStep === null || $step > $lastStep) && hash_equals(self::code($secret, $step), $code)) {
                return $step;
            }
        }

        return null;
    }

    public static function uri(string $secret, string $account, string $issuer = 'Srawung'): string
    {
        return 'otpauth://totp/' . rawurlencode("{$issuer}:{$account}") . '?' . http_build_query([
            'secret' => $secret, 'issuer' => $issuer, 'algorithm' => 'SHA1', 'digits' => 6, 'period' => self::PERIOD,
        ]);
    }

    private static function base32(string $bytes): string
    {
        $bits = '';
        foreach (str_split($bytes) as $b) {
            $bits .= str_pad(decbin(ord($b)), 8, '0', STR_PAD_LEFT);
        }

        return implode('', array_map(fn ($c) => self::ALPHABET[bindec(str_pad($c, 5, '0'))], str_split($bits, 5)));
    }

    private static function decode(string $secret): string
    {
        $bits = '';
        foreach (str_split(strtoupper($secret)) as $c) {
            $i = strpos(self::ALPHABET, $c);
            if ($i !== false) {
                $bits .= str_pad(decbin($i), 5, '0', STR_PAD_LEFT);
            }
        }
        $out = '';
        foreach (str_split($bits, 8) as $chunk) {
            if (strlen($chunk) === 8) {
                $out .= chr(bindec($chunk));
            }
        }

        return $out;
    }
}
