<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

/**
 * Bangun semua aset logo SRAWUNG dari satu file logo (PNG berlatar transparan):
 *
 *   php artisan srawung:brand-assets
 *   php artisan srawung:brand-assets --source=D:/path/logo.png
 *
 * Hasil (frontend/public/brand & frontend/src/app):
 *  - srawung-logo.webp / -white.webp   logo lengkap (warna asli / putih untuk latar gelap)
 *  - srawung-mark.webp / -white.webp   monogram S saja (dipotong otomatis dari celah transparan
 *                                      antara monogram dan wordmark) — untuk ukuran sangat kecil
 *  - og-image.png                      gambar pratinjau tautan (1200×630)
 *
 * Ikon web (favicon, icon.png, apple-icon.png) TIDAK dibuat dari logo 3D — terlalu detail untuk
 * 16–32 px. Ikon memakai versi datar sederhana: public/brand/srawung-icon.svg.
 */
class BuildBrandAssets extends Command
{
    protected $signature = 'srawung:brand-assets {--source= : Path file logo (bawaan: frontend/public/brand/srawung-logo.png)}';

    protected $description = 'Buat logo, monogram, versi putih, favicon, dan gambar OG SRAWUNG dari satu file logo';

    private const MINT = [0xF2, 0xF7, 0xF4];
    private const HIJAU_TUA = [0x0F, 0x4C, 0x3F];
    private const JADE = [0x2F, 0xAE, 0x7B];

    public function handle(): int
    {
        $front = dirname(base_path()) . '/frontend';
        $source = $this->option('source') ?: "{$front}/public/brand/srawung-logo.png";
        if (!is_file($source)) {
            $this->error("File logo tidak ditemukan: {$source}");
            $this->line('Simpan logo (PNG transparan) sebagai frontend/public/brand/srawung-logo.png lalu jalankan ulang.');

            return self::FAILURE;
        }

        $src = imagecreatefromstring((string) file_get_contents($source));
        if (!$src) {
            $this->error('File logo tidak bisa dibaca sebagai gambar.');

            return self::FAILURE;
        }
        imagepalettetotruecolor($src);
        imagesavealpha($src, true);

        // 1) Buang tepi transparan.
        [$x0, $y0, $x1, $y1] = $this->bbox($src, 0, 0, imagesx($src) - 1, imagesy($src) - 1);
        $logo = $this->crop($src, $x0, $y0, $x1 - $x0 + 1, $y1 - $y0 + 1);
        $w = imagesx($logo);
        $h = imagesy($logo);

        // 2) Monogram = bagian kiri sampai celah transparan pertama yang cukup lebar.
        $gapStart = $this->firstGap($logo, max(3, (int) round($h * 0.04)));
        $mark = $gapStart ? $this->crop($logo, 0, 0, $gapStart, $h) : null;
        if ($mark) {
            [$mx0, $my0, $mx1, $my1] = $this->bbox($mark, 0, 0, imagesx($mark) - 1, imagesy($mark) - 1);
            $mark = $this->crop($mark, $mx0, $my0, $mx1 - $mx0 + 1, $my1 - $my0 + 1);
        } else {
            $this->warn('Celah antara monogram dan wordmark tidak terdeteksi — monogram memakai logo penuh.');
            $mark = $logo;
        }

        $brand = "{$front}/public/brand";
        $logoH = 160;   // tajam untuk tampilan ±32–40 px di layar retina
        $this->webp($this->scaleH($logo, $logoH), "{$brand}/srawung-logo.webp");
        // Latar gelap: wordmark putih + monogram jade terang (aturan pakai company profile).
        $markShare = $gapStart ? $gapStart / $w : 0;
        $this->webp($this->forDark($this->scaleH($logo, $logoH), $markShare), "{$brand}/srawung-logo-white.webp");
        $this->webp($this->scaleH($mark, 256), "{$brand}/srawung-mark.webp");
        $this->webp($this->forDark($this->scaleH($mark, 256), 1.0), "{$brand}/srawung-mark-white.webp");

        // Gambar OG: latar mint, logo di tengah, garis jade (gaya company profile).
        $og = $this->canvas(1200, 630, self::MINT);
        $ogLogo = $this->scaleW($logo, 760);
        if (imagesy($ogLogo) > 300) {
            $ogLogo = $this->scaleH($logo, 300);
        }
        imagecopy($og, $ogLogo, (int) ((1200 - imagesx($ogLogo)) / 2), (int) ((630 - imagesy($ogLogo)) / 2) - 30, 0, 0, imagesx($ogLogo), imagesy($ogLogo));
        imagefilledrectangle($og, 520, 470, 680, 477, imagecolorallocate($og, ...self::JADE));
        imagefilledrectangle($og, 1140, 0, 1200, 630, imagecolorallocate($og, ...self::HIJAU_TUA));
        imagepng($og, "{$brand}/og-image.png");

        $this->info(sprintf('Selesai. Logo %d×%d px (rasio %.2f), monogram %d×%d px.', $w, $h, $w / $h, imagesx($mark), imagesy($mark)));
        foreach (['public/brand/srawung-logo.webp', 'public/brand/srawung-logo-white.webp', 'public/brand/srawung-mark.webp', 'public/brand/srawung-mark-white.webp', 'public/brand/og-image.png'] as $f) {
            $this->line('  ✓ frontend/' . $f);
        }

        return self::SUCCESS;
    }

    /** Kotak terkecil yang memuat piksel tidak transparan. */
    private function bbox(\GdImage $img, int $x0, int $y0, int $x1, int $y1): array
    {
        $minX = $x1;
        $minY = $y1;
        $maxX = $x0;
        $maxY = $y0;
        for ($y = $y0; $y <= $y1; $y++) {
            for ($x = $x0; $x <= $x1; $x++) {
                if (((imagecolorat($img, $x, $y) >> 24) & 0x7F) < 100) {
                    $minX = min($minX, $x);
                    $maxX = max($maxX, $x);
                    $minY = min($minY, $y);
                    $maxY = max($maxY, $y);
                }
            }
        }

        return $maxX >= $minX ? [$minX, $minY, $maxX, $maxY] : [$x0, $y0, $x1, $y1];
    }

    /** Kolom awal celah transparan pertama (selebar ≥ $minWidth) setelah ada piksel terlihat. */
    private function firstGap(\GdImage $img, int $minWidth): ?int
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $seen = false;
        $run = 0;
        for ($x = 0; $x < $w; $x++) {
            $empty = true;
            for ($y = 0; $y < $h; $y += 2) {
                if (((imagecolorat($img, $x, $y) >> 24) & 0x7F) < 100) {
                    $empty = false;
                    break;
                }
            }
            if (!$empty) {
                $seen = true;
                $run = 0;
            } elseif ($seen && ++$run >= $minWidth) {
                return $x - $run + 1;
            }
        }

        return null;
    }

    private function canvas(int $w, int $h, ?array $bg): \GdImage
    {
        $c = imagecreatetruecolor($w, $h);
        imagealphablending($c, false);
        imagesavealpha($c, true);
        imagefill($c, 0, 0, $bg ? imagecolorallocate($c, ...$bg) : imagecolorallocatealpha($c, 0, 0, 0, 127));
        imagealphablending($c, true);

        return $c;
    }

    private function crop(\GdImage $img, int $x, int $y, int $w, int $h): \GdImage
    {
        $c = $this->canvas($w, $h, null);
        imagealphablending($c, false);
        imagecopy($c, $img, 0, 0, $x, $y, $w, $h);

        return $c;
    }

    private function resize(\GdImage $img, int $w, int $h): \GdImage
    {
        $c = $this->canvas($w, $h, null);
        imagealphablending($c, false);
        imagecopyresampled($c, $img, 0, 0, 0, 0, $w, $h, imagesx($img), imagesy($img));

        return $c;
    }

    private function scaleH(\GdImage $img, int $h): \GdImage
    {
        return $this->resize($img, max(1, (int) round(imagesx($img) * $h / imagesy($img))), $h);
    }

    private function scaleW(\GdImage $img, int $w): \GdImage
    {
        return $this->resize($img, $w, max(1, (int) round(imagesy($img) * $w / imagesx($img))));
    }

    /**
     * Versi untuk latar gelap. Relief 3D tetap terlihat (tidak dijadikan siluet polos):
     *  - wordmark → putih keperakan: terang = putih, sisi timbul yang gelap = abu muda;
     *  - monogram (bagian kiri sebesar $markShare dari lebar) → warna asli dicerahkan (jade terang).
     */
    private function forDark(\GdImage $img, float $markShare): \GdImage
    {
        $w = imagesx($img);
        $h = imagesy($img);
        $markEnd = (int) round($w * $markShare);
        $c = $this->canvas($w, $h, null);
        imagealphablending($c, false);
        for ($y = 0; $y < $h; $y++) {
            for ($x = 0; $x < $w; $x++) {
                $px = imagecolorat($img, $x, $y);
                $a = ($px >> 24) & 0x7F;
                if ($a === 127) {
                    imagesetpixel($c, $x, $y, imagecolorallocatealpha($c, 0, 0, 0, 127));
                    continue;
                }
                $r = ($px >> 16) & 0xFF;
                $g = ($px >> 8) & 0xFF;
                $b = $px & 0xFF;
                if ($x < $markEnd) {
                    // Jade terang: dekatkan 45% ke putih, rona hijau tetap.
                    [$r, $g, $b] = array_map(fn ($v) => (int) round($v + (255 - $v) * 0.45), [$r, $g, $b]);
                } else {
                    // Putih keperakan dengan relief: luminans 0..1 → 170..255.
                    $lum = (0.299 * $r + 0.587 * $g + 0.114 * $b) / 255;
                    $v = (int) round(170 + 85 * min(1, pow($lum * 2.2, 0.6)));
                    [$r, $g, $b] = [$v, $v, min(255, $v + 2)];
                }
                imagesetpixel($c, $x, $y, imagecolorallocatealpha($c, $r, $g, $b, $a));
            }
        }

        return $c;
    }

    /** Monogram di tengah kanvas persegi dengan bantalan. */
    private function square(\GdImage $mark, int $size, ?array $bg, float $pad): \GdImage
    {
        $c = $this->canvas($size, $size, $bg);
        $inner = (int) round($size * (1 - 2 * $pad));
        $scale = min($inner / imagesx($mark), $inner / imagesy($mark));
        $w = max(1, (int) round(imagesx($mark) * $scale));
        $h = max(1, (int) round(imagesy($mark) * $scale));
        imagecopyresampled($c, $mark, (int) (($size - $w) / 2), (int) (($size - $h) / 2), 0, 0, $w, $h, imagesx($mark), imagesy($mark));

        return $c;
    }

    private function webp(\GdImage $img, string $path): void
    {
        imagewebp($img, $path, 90);
    }

    /** File .ico berisi gambar PNG (didukung semua browser modern). @param list<\GdImage> $images */
    private function ico(array $images): string
    {
        $pngs = array_map(function (\GdImage $i) {
            ob_start();
            imagepng($i);

            return (string) ob_get_clean();
        }, $images);
        $out = pack('vvv', 0, 1, count($pngs));
        $offset = 6 + 16 * count($pngs);
        foreach ($pngs as $i => $png) {
            $s = imagesx($images[$i]);
            $out .= pack('CCCCvvVV', $s >= 256 ? 0 : $s, $s >= 256 ? 0 : $s, 0, 0, 1, 32, strlen($png), $offset);
            $offset += strlen($png);
        }

        return $out . implode('', $pngs);
    }
}
