<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

/**
 * Pengaman gambar unggahan. File 1 MB bisa mengembang jadi gigabyte di memori saat dibuka
 * ("decompression bomb") dan menjatuhkan server, jadi ukuran piksel diperiksa dari header
 * gambar SEBELUM dibuka.
 */
class ImageGuard
{
    public const MAX_PIXELS = 60_000_000; // ±7700×7700

    public static function isSafe(string $path): bool
    {
        $info = @getimagesize($path);

        return $info !== false && $info[0] > 0 && $info[1] > 0 && $info[0] * $info[1] <= self::MAX_PIXELS;
    }

    public static function assertSafe(string $path, string $field): void
    {
        if (!self::isSafe($path)) {
            throw ValidationException::withMessages([$field => 'Gambar tidak dapat dibaca atau dimensinya terlalu besar (maksimal ±7700×7700 piksel).']);
        }
    }
}
