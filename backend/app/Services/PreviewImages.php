<?php

namespace App\Services;

use App\Models\Book;
use App\Models\BookPage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

/**
 * Gambar halaman pratinjau gratis ("Intip isi buku"): diperkecil, diberi watermark
 * "PRATINJAU", lalu disimpan sebagai FILE STATIS di disk publik. Browser mengambilnya
 * langsung dari /storage (dilayani web server tanpa menyalakan Laravel), jadi jauh lebih
 * cepat daripada lewat API. Aman: hanya halaman pratinjau gratis yang pernah dibuat.
 *
 *  - Dua ukuran: thumbnail 240 px (deretan "Intip isi buku") & penuh 900 px (modal).
 *  - Cache per "versi" buku (berubah saat halaman dikonversi ulang / pratinjau diubah),
 *    versi lama dihapus otomatis saat cache dipanaskan.
 */
class PreviewImages
{
    public const WIDTHS = ['thumb' => 240, 'full' => 900];

    /** @return array{binary: string, type: string, etag: string} */
    public function get(Book $book, int $page, int $width): array
    {
        $width = in_array($width, self::WIDTHS, true) ? $width : self::WIDTHS['full'];
        $version = self::version($book);
        $path = "previews/{$book->id}/{$version}/p{$page}-w{$width}.webp";
        $disk = Storage::disk('public');

        if ($disk->exists($path)) {
            return ['binary' => $disk->get($path), 'type' => 'image/webp', 'etag' => "\"{$version}-{$page}-{$width}\""];
        }

        [$binary, $real] = $this->render($book, $page, $width);
        if ($real) {
            $disk->put($path, $binary); // halaman pengganti (file belum ada) tidak di-cache
        }

        return ['binary' => $binary, 'type' => 'image/webp', 'etag' => "\"{$version}-{$page}-{$width}\""];
    }

    /** Buat semua gambar pratinjau sebuah buku di muka & bersihkan cache versi lama. */
    public function warm(Book $book): int
    {
        $disk = Storage::disk('public');
        $version = self::version($book);
        foreach ($disk->directories("previews/{$book->id}") as $dir) {
            if (basename($dir) !== $version) {
                $disk->deleteDirectory($dir);
            }
        }
        $made = 0;
        for ($p = 1; $p <= self::limit($book); $p++) {
            foreach (self::WIDTHS as $w) {
                $this->get($book, $p, $w);
                $made++;
            }
        }

        return $made;
    }

    /**
     * URL statis semua halaman pratinjau (dibuat dulu bila belum ada).
     *
     * @return list<array{page: int, thumb: string, full: string}>
     */
    public function urls(Book $book): array
    {
        $disk = Storage::disk('public');
        $version = self::version($book);
        $out = [];
        for ($p = 1; $p <= self::limit($book); $p++) {
            $row = ['page' => $p];
            foreach (self::WIDTHS as $key => $w) {
                $path = "previews/{$book->id}/{$version}/p{$p}-w{$w}.webp";
                if (!$disk->exists($path)) {
                    $this->get($book, $p, $w);
                }
                // Halaman pengganti (file halaman belum ada) tidak di-cache → pakai API.
                $row[$key] = $disk->exists($path) ? $disk->url($path) : null;
            }
            if ($row['thumb'] && $row['full']) {
                $out[] = $row;
            }
        }

        return $out;
    }

    public static function limit(Book $book): int
    {
        return min((int) ($book->preview_pages ?: 5), (int) ($book->total_pages ?: PHP_INT_MAX));
    }

    private static function version(Book $book): string
    {
        return substr(md5(($book->processing_finished_at ?? $book->updated_at) . '|' . $book->preview_pages . '|' . $book->title . '|' . $book->total_pages), 0, 10);
    }

    /** @return array{0: string, 1: bool} [webp, apakah dari gambar halaman asli] */
    private function render(Book $book, int $pageNumber, int $width): array
    {
        [$image, $real] = $this->load($book, $pageNumber);

        // Watermark pada ukuran penuh, lalu diperkecil untuk thumbnail (watermark ikut mengecil).
        if (imagesx($image) !== self::WIDTHS['full']) {
            $scaled = imagescale($image, self::WIDTHS['full']);
            if ($scaled) {
                imagedestroy($image);
                $image = $scaled;
            }
        }
        $w = imagesx($image);
        $h = imagesy($image);
        $limit = self::limit($book);
        $mark = imagecolorallocatealpha($image, 100, 116, 139, 70);
        imagestring($image, 5, 30, 24, 'PRATINJAU GRATIS - Srawung', $mark);
        imagestring($image, 5, max(30, (int) ($w / 2) - 120), (int) ($h / 2), 'PRATINJAU - beli untuk akses penuh', $mark);
        imagestring($image, 5, 30, $h - 40, "{$book->title} - hal. {$pageNumber}/{$limit}", $mark);

        if ($width < $w) {
            $thumb = imagescale($image, $width, -1, IMG_BICUBIC);
            if ($thumb) {
                imagedestroy($image);
                $image = $thumb;
            }
        }

        ob_start();
        imagewebp($image, null, $width < self::WIDTHS['full'] ? 72 : 80);
        $binary = (string) ob_get_clean();
        imagedestroy($image);

        return [$binary, $real];
    }

    /** @return array{0: \GdImage, 1: bool} */
    private function load(Book $book, int $pageNumber): array
    {
        $page = BookPage::where('book_id', $book->id)->where('page_number', $pageNumber)->first();
        $path = $page ? Storage::disk('local')->path($page->image_path) : null;

        if ($path && is_file($path)) {
            try {
                $image = @imagecreatefromstring((string) file_get_contents($path));
                if ($image) {
                    return [$image, true];
                }
            } catch (\Throwable $e) {
                Log::warning("Gambar halaman {$pageNumber} buku #{$book->id} rusak: {$e->getMessage()}");
            }
        }

        // File halaman belum ada → halaman pengganti sederhana (tidak di-cache).
        $image = imagecreatetruecolor(800, 1130);
        $bg = imagecolorallocate($image, 255, 255, 255);
        $fg = imagecolorallocate($image, 30, 41, 59);
        $gray = imagecolorallocate($image, 148, 163, 184);
        imagefill($image, 0, 0, $bg);
        imagerectangle($image, 20, 20, 780, 1110, $gray);
        imagestring($image, 5, 40, 50, $book->title, $fg);
        imagestring($image, 4, 40, 80, 'Penulis: ' . $book->author, $fg);
        imagestring($image, 4, 40, 140, "Halaman {$pageNumber} dari {$book->total_pages}", $fg);

        return [$image, false];
    }
}
