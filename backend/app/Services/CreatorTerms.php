<?php

namespace App\Services;

use App\Models\CreatorProfile;

/**
 * Syarat & Ketentuan Kreator. Naikkan VERSION setiap kali isi S&K berubah secara
 * material — semua kreator akan diminta menyetujui ulang sebelum menerbitkan buku
 * atau menarik saldo. Teks lengkapnya ada di halaman /syarat-kreator.
 */
class CreatorTerms
{
    public const VERSION = '2026-11-18';

    /** Angka yang disebut di S&K, mengikuti pengaturan admin. */
    public static function facts(): array
    {
        return [
            'version' => self::VERSION,
            'commission_percent' => CreatorLedger::defaultCommission(),
            'min_payout' => CreatorLedger::minPayout(),
            'payout_fee' => CreatorLedger::payoutFee(),
        ];
    }

    /** @return array{version: string, accepted_version: ?string, accepted_at: ?string, needs_acceptance: bool} */
    public static function statusFor(?CreatorProfile $profile): array
    {
        return [
            'version' => self::VERSION,
            'accepted_version' => $profile?->terms_version,
            'accepted_at' => $profile?->terms_accepted_at?->toIso8601String(),
            'needs_acceptance' => !$profile?->acceptedCurrentTerms(),
        ];
    }
}
