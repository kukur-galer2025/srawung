<?php

namespace App\Services;

use App\Models\Setting;
use Illuminate\Support\Facades\Storage;

/**
 * Satu-satunya metode pembayaran: QRIS statis milik toko.
 *
 * Pembeli memindai QRIS, membayar tepat sebesar total pesanan, lalu mengunggah
 * bukti pembayaran di halaman pesanan — admin mencocokkannya dengan mutasi QRIS.
 */
class PaymentInfo
{
    public const DEFAULT_IMAGE = 'payment/qris-amania.webp';
    public const DEFAULT_MERCHANT = 'AMANIA - SOFTWARE';
    public const DEFAULT_NMID = 'ID1026514804818';

    /** Data untuk halaman pembayaran & email. */
    public static function get(): array
    {
        return [
            'method' => 'qris',
            'merchant_name' => Setting::get('qris_merchant_name') ?: self::DEFAULT_MERCHANT,
            'nmid' => Setting::get('qris_nmid') ?: self::DEFAULT_NMID,
            'qris_url' => self::imageUrl(),
            'whatsapp_admin' => Setting::get('whatsapp_admin', '6285181836438'),
        ];
    }

    public static function imagePath(): string
    {
        return Setting::get('qris_image_path') ?: self::DEFAULT_IMAGE;
    }

    /** URL publik gambar QRIS (dengan penanda versi agar cache browser ikut berganti). */
    public static function imageUrl(): ?string
    {
        $disk = Storage::disk('public');
        $path = self::imagePath();
        if (!$disk->exists($path)) {
            return null;
        }

        return $disk->url($path) . '?v=' . $disk->lastModified($path);
    }

    /**
     * Path PNG lokal untuk disisipkan ke invoice PDF (dompdf tidak selalu mendukung WebP).
     * Dibuat ulang otomatis bila gambar QRIS diganti.
     */
    public static function pdfImagePath(): ?string
    {
        $disk = Storage::disk('public');
        $path = self::imagePath();
        if (!$disk->exists($path)) {
            return null;
        }

        $src = $disk->path($path);
        if (str_ends_with(strtolower($path), '.png')) {
            return $src;
        }

        $png = storage_path('app/qris-pdf-' . md5($path . filemtime($src)) . '.png');
        if (!is_file($png)) {
            $img = @imagecreatefromstring((string) file_get_contents($src));
            if ($img === false) {
                return null;
            }
            imagepng($img, $png, 6);
            imagedestroy($img);
        }

        return $png;
    }
}
