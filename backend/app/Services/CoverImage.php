<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Sampul buku: ukuran unggahan bebas, tetapi file yang disimpan selalu ringan.
 *
 * Gambar apa pun (JPG/PNG/WebP/GIF/BMP/AVIF) diputar sesuai EXIF, diperkecil ke
 * lebar maksimal 1200 px (cukup tajam untuk layar retina) lalu disimpan sebagai
 * WebP — biasanya 10–20× lebih kecil dari aslinya sehingga katalog cepat tampil.
 * Bila gambar tak bisa diolah (format tak dikenal GD, memori tak cukup), file asli
 * tetap disimpan apa adanya agar unggahan tidak pernah gagal karena konversi.
 */
class CoverImage
{
    public const MAX_WIDTH = 1200;
    public const MAX_HEIGHT = 1800;
    public const QUALITY = 82;

    /** Simpan sampul unggahan di disk public; mengembalikan path relatif. */
    public static function store(UploadedFile $file, string $dir = 'covers'): string
    {
        $webp = self::toWebp($file->getRealPath());
        if ($webp !== null) {
            $path = trim($dir, '/') . '/cover_' . now()->format('YmdHis') . '_' . Str::random(8) . '.webp';
            Storage::disk('public')->put($path, $webp);

            return $path;
        }

        $ext = strtolower($file->getClientOriginalExtension() ?: $file->extension() ?: 'jpg');

        return $file->storeAs(trim($dir, '/'), 'cover_' . now()->format('YmdHis') . '_' . Str::random(8) . '.' . $ext, 'public');
    }

    /**
     * Konversi file gambar menjadi WebP terkompresi. Mengembalikan isi biner,
     * atau null bila tidak bisa diolah.
     */
    public static function toWebp(string $sourcePath): ?string
    {
        if (!function_exists('imagewebp') || !is_file($sourcePath)) {
            return null;
        }

        $info = @getimagesize($sourcePath);
        if (!$info || $info[0] < 1 || $info[1] < 1) {
            return null;
        }
        [$width, $height] = $info;

        // Gambar sangat besar butuh memori: ±5 byte/piksel untuk sumber + hasil.
        $needed = (int) ($width * $height * 5 + 64 * 1024 * 1024);
        self::ensureMemory($needed);

        try {
            $src = @imagecreatefromstring((string) file_get_contents($sourcePath));
        } catch (\Throwable $e) {
            $src = false;
        }
        if ($src === false) {
            return null;
        }

        try {
            $src = self::applyExifOrientation($src, $sourcePath, $info[2] ?? null);
            $width = imagesx($src);
            $height = imagesy($src);

            $scale = min(1, self::MAX_WIDTH / $width, self::MAX_HEIGHT / $height);
            $w = max(1, (int) round($width * $scale));
            $h = max(1, (int) round($height * $scale));

            $out = $src;
            if ($scale < 1) {
                $out = imagecreatetruecolor($w, $h);
                imagealphablending($out, false);
                imagesavealpha($out, true);
                imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
                imagecopyresampled($out, $src, 0, 0, 0, 0, $w, $h, $width, $height);
            } else {
                if (!imageistruecolor($out)) {
                    imagepalettetotruecolor($out);
                }
                imagealphablending($out, false);
                imagesavealpha($out, true);
            }

            ob_start();
            $ok = imagewebp($out, null, self::QUALITY);
            $data = (string) ob_get_clean();

            if ($out !== $src) {
                imagedestroy($out);
            }

            return $ok && $data !== '' ? $data : null;
        } catch (\Throwable $e) {
            Log::warning('Konversi sampul gagal, file asli disimpan', ['error' => $e->getMessage()]);

            return null;
        } finally {
            imagedestroy($src);
        }
    }

    /** Lebar varian sampul (px). Kartu katalog ±200 px → 320 untuk layar retina; 640 untuk halaman detail. */
    public const VARIANT_WIDTHS = [160, 320, 640];

    /** Lebar placeholder buram (px) — cukup kecil untuk disisipkan langsung di HTML. */
    public const PLACEHOLDER_WIDTH = 16;

    /**
     * Buat varian WebP kecil (cover_x-160.webp, -320, -640) di samping file sampul dan
     * placeholder buram mini. Mengembalikan metadata {w: list<int>, ph: ?string} atau
     * null bila sampul tak bisa diolah (file tidak ada, URL eksternal, GD tidak tersedia).
     */
    public static function buildVariants(string $path): ?array
    {
        $disk = Storage::disk('public');
        if (filter_var($path, FILTER_VALIDATE_URL) || !function_exists('imagewebp') || !$disk->exists($path)) {
            return null;
        }

        try {
            $src = @imagecreatefromstring((string) $disk->get($path));
        } catch (\Throwable $e) {
            $src = false;
        }
        if ($src === false) {
            return null;
        }

        try {
            if (!imageistruecolor($src)) {
                imagepalettetotruecolor($src);
            }
            $width = imagesx($src);
            $height = imagesy($src);
            $base = preg_replace('/\.[^.\/]+$/', '', $path);
            $made = [];

            foreach (self::VARIANT_WIDTHS as $target) {
                $w = min($target, $width);
                $h = max(1, (int) round($height * $w / $width));
                $data = self::encodeResized($src, $width, $height, $w, $h, 78);
                if ($data !== null) {
                    $disk->put("{$base}-{$target}.webp", $data);
                    $made[] = $target;
                }
            }

            $phW = self::PLACEHOLDER_WIDTH;
            $phH = max(1, (int) round($height * $phW / $width));
            $ph = self::encodeResized($src, $width, $height, $phW, $phH, 40);

            return ['w' => $made, 'ph' => $ph !== null ? 'data:image/webp;base64,' . base64_encode($ph) : null];
        } catch (\Throwable $e) {
            Log::warning('Varian sampul gagal dibuat', ['path' => $path, 'error' => $e->getMessage()]);

            return null;
        } finally {
            imagedestroy($src);
        }
    }

    /** Hapus varian milik sampul lama (saat sampul diganti). */
    public static function deleteVariants(?string $path): void
    {
        if (!$path || filter_var($path, FILTER_VALIDATE_URL)) {
            return;
        }
        $base = preg_replace('/\.[^.\/]+$/', '', $path);
        Storage::disk('public')->delete(array_map(fn ($w) => "{$base}-{$w}.webp", self::VARIANT_WIDTHS));
    }

    private static function encodeResized(\GdImage $src, int $sw, int $sh, int $w, int $h, int $quality): ?string
    {
        $out = imagecreatetruecolor($w, $h);
        imagealphablending($out, false);
        imagesavealpha($out, true);
        imagefill($out, 0, 0, imagecolorallocatealpha($out, 0, 0, 0, 127));
        imagecopyresampled($out, $src, 0, 0, 0, 0, $w, $h, $sw, $sh);
        ob_start();
        $ok = imagewebp($out, null, $quality);
        $data = (string) ob_get_clean();
        imagedestroy($out);

        return $ok && $data !== '' ? $data : null;
    }

    private static function ensureMemory(int $bytes): void
    {
        $limit = ini_get('memory_limit');
        if ($limit === '-1' || $limit === false) {
            return;
        }
        $current = self::toBytes($limit);
        if ($bytes > $current) {
            // Batasi kenaikan agar satu unggahan tidak menghabiskan memori server.
            @ini_set('memory_limit', (string) min($bytes, 2048 * 1024 * 1024));
        }
    }

    private static function toBytes(string $value): int
    {
        $value = trim($value);
        $unit = strtolower(substr($value, -1));
        $n = (int) $value;

        return match ($unit) {
            'g' => $n * 1024 ** 3,
            'm' => $n * 1024 ** 2,
            'k' => $n * 1024,
            default => (int) $value,
        };
    }

    /** Foto dari ponsel sering tersimpan miring; putar sesuai tag EXIF Orientation. */
    private static function applyExifOrientation(\GdImage $img, string $path, ?int $type): \GdImage
    {
        if ($type !== IMAGETYPE_JPEG || !function_exists('exif_read_data')) {
            return $img;
        }
        $exif = @exif_read_data($path);
        $angle = match ((int) ($exif['Orientation'] ?? 1)) {
            3 => 180,
            6 => -90,
            8 => 90,
            default => 0,
        };
        if ($angle === 0) {
            return $img;
        }
        $rotated = imagerotate($img, $angle, 0);
        if ($rotated === false) {
            return $img;
        }
        imagedestroy($img);

        return $rotated;
    }
}
