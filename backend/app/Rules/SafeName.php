<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/**
 * Nama orang: huruf, angka, spasi, dan . , ' - saja, tanpa alamat web. Nama ikut tampil di email
 * Srawung; tanpa aturan ini orang bisa mendaftar memakai email korban dengan nama berisi tautan
 * penipuan, lalu sistem mengirimkannya sebagai email resmi.
 */
class SafeName implements ValidationRule
{
    private const URL = '/(https?|www\.|\.(com|net|org|id|xyz|ru|info|io|site|online|top|click|link|shop|store)\b)/iu';

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        $value = is_string($value) ? trim($value) : '';
        if ($value === '' || mb_strlen($value) > 100 || !preg_match("/^[\p{L}\p{M}\p{N} .,'’\-]+$/u", $value) || preg_match(self::URL, $value)) {
            $fail('Nama hanya boleh berisi huruf, angka, spasi, titik, koma, dan tanda hubung.');
        }
    }

    /** Versi bersih untuk nama dari luar (mis. akun Google) yang tidak boleh menggagalkan login. */
    public static function clean(?string $value, string $fallback = 'Pembaca'): string
    {
        $value = preg_replace("/[^\p{L}\p{M}\p{N} .,'’\-]+/u", ' ', (string) $value);
        $value = preg_replace(self::URL, ' ', (string) $value);
        $value = trim(mb_substr(preg_replace('/\s+/u', ' ', (string) $value), 0, 100));

        return $value === '' ? $fallback : $value;
    }
}
