<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * Mengenali permintaan dari server frontend sendiri (Next.js membuat halaman di server). Satu IP itu
 * mewakili semua pengunjung, jadi tidak boleh dibatasi seperti satu orang.
 */
class SsrClient
{
    public static function is(?string $ip): bool
    {
        return $ip !== null && (in_array($ip, config('amania.security.ssr_ips'), true) || in_array($ip, self::ownAddresses(), true));
    }

    /** Alamat IP server ini menurut DNS APP_URL — tetap benar walau SSR_IPS lupa diisi. @return list<string> */
    private static function ownAddresses(): array
    {
        if (!app()->isProduction()) {
            return [];
        }

        return Cache::remember('ssr-own-addresses', now()->addHours(6), function () {
            $host = (string) parse_url((string) config('app.url'), PHP_URL_HOST);
            $records = $host ? (@dns_get_record($host, DNS_A | DNS_AAAA) ?: []) : [];

            return array_values(array_filter(array_map(fn ($r) => $r['ip'] ?? $r['ipv6'] ?? null, $records)));
        });
    }
}
