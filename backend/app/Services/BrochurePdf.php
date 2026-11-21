<?php

namespace App\Services;

use App\Models\Book;
use App\Models\Setting;
use Barryvdh\DomPDF\Facade\Pdf;
use chillerlan\QRCode\Common\EccLevel;
use chillerlan\QRCode\Data\QRMatrix;
use chillerlan\QRCode\Output\QRGdImagePNG;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Brosur promosi PDF dari buku pilihan admin.
 *
 * Tata letak:
 *  - "katalog": 6 buku per halaman (kartu 2 kolom) — untuk daftar panjang;
 *  - "sorotan": 2 buku per halaman, sampul besar & sinopsis lebih panjang.
 * Opsional sampul depan (judul + deretan sampul buku) dan sampul belakang
 * (cara membeli, kode promo, QR katalog, kontak WhatsApp).
 *
 * Setiap buku diberi QR menuju halaman belinya (dengan ?ref=brosur agar
 * kunjungan dari brosur bisa dibedakan).
 */
class BrochurePdf
{
    public const LAYOUTS = ['katalog', 'sorotan'];

    public const MAX_BOOKS = 40;

    private const PER_PAGE = ['katalog' => 6, 'sorotan' => 2];

    /** Hijau tua merek untuk modul QR. */
    private const INK = [11, 59, 49];

    /**
     * @param  Collection<int, Book>  $books  urutan = urutan di brosur
     * @param  array{layout?: string, title?: ?string, subtitle?: ?string, show_prices?: bool, include_cover?: bool, promo_code?: ?string, promo_note?: ?string}  $opt
     */
    public static function render(Collection $books, array $opt = []): string
    {
        $layout = in_array($opt['layout'] ?? '', self::LAYOUTS, true) ? $opt['layout'] : 'katalog';
        $site = rtrim((string) config('app.frontend_url'), '/');
        $items = $books->values()->map(fn (Book $b) => [
            'title' => $title = Str::limit(trim($b->title), $layout === 'sorotan' ? 90 : 62),
            'author' => Str::limit(trim((string) $b->author), 48),
            'category' => $b->category?->name,
            'synopsis' => Str::limit(self::plain($b->synopsis), self::synopsisLimit($layout, $title)),
            'pages' => (int) $b->total_pages,
            'rating' => $b->rating_count > 0 ? number_format((float) $b->rating_avg, 1, ',', '') : null,
            'price' => (int) $b->price,
            'effective' => (int) $b->effective_price,
            'discount' => (int) $b->discount_percent,
            'cover' => self::cover($b, $layout === 'sorotan' ? 520 : 300),
            'qr' => self::qr("{$site}/buku/{$b->slug}?ref=brosur"),
        ]);

        $whatsapp = preg_replace('/\D/', '', (string) Setting::get('whatsapp_admin'));
        $data = [
            'layout' => $layout,
            'pages' => $items->chunk(self::PER_PAGE[$layout])->map->values(),
            'count' => $items->count(),
            'title' => trim((string) ($opt['title'] ?? '')) ?: 'Katalog Buku Pilihan',
            'subtitle' => trim((string) ($opt['subtitle'] ?? '')) ?: 'Buku digital untuk belajar skill baru — baca di HP, tablet, atau laptop, akses selamanya.',
            'showPrices' => (bool) ($opt['show_prices'] ?? true),
            'includeCover' => (bool) ($opt['include_cover'] ?? true),
            'promoCode' => strtoupper(trim((string) ($opt['promo_code'] ?? ''))) ?: null,
            'promoNote' => trim((string) ($opt['promo_note'] ?? '')) ?: null,
            'edition' => now()->locale('id')->translatedFormat('F Y'),
            'siteHost' => parse_url($site, PHP_URL_HOST) ?: $site,
            'catalogQr' => self::qr("{$site}/buku?ref=brosur"),
            'whatsapp' => $whatsapp ?: null,
            'whatsappQr' => $whatsapp ? self::qr("https://wa.me/{$whatsapp}") : null,
            'logoWhite' => self::image(resource_path('brand/srawung-logo-white.webp'), 520, 'png'),
            'logoDark' => self::image(resource_path('brand/srawung-logo.webp'), 420, 'png'),
            'heroCovers' => $items->pluck('cover')->filter()->take(4)->values(),
            'fonts' => self::fonts(),
        ];

        // dompdf menyimpan metrik font hasil @font-face di sini.
        File::ensureDirectoryExists(storage_path('fonts'));

        return Pdf::loadView('pdf.brochure', $data)
            ->setPaper('a4')
            ->setOption(['dpi' => 96, 'defaultFont' => 'Inter', 'isFontSubsettingEnabled' => true])
            ->output();
    }

    public static function filename(): string
    {
        return 'Brosur-Srawung-' . now()->format('Y-m-d') . '.pdf';
    }

    /**
     * Panjang sinopsis yang muat di kartu. Kartu katalog bertinggi tetap: makin banyak
     * baris judul, makin sedikit baris sinopsis (±22 huruf judul & ±26 huruf sinopsis per baris).
     */
    private static function synopsisLimit(string $layout, string $title): int
    {
        if ($layout === 'sorotan') {
            return mb_strlen($title) > 45 ? 360 : 430;
        }
        $titleLines = min(3, max(1, (int) ceil(mb_strlen($title) / 22)));

        return (7 - $titleLines) * 25;
    }

    /** Teks polos satu paragraf dari sinopsis (bisa berisi HTML/markdown ringan). */
    private static function plain(?string $text): string
    {
        $text = html_entity_decode(strip_tags((string) $text), ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $text = preg_replace('/[*_#>`]+/', '', $text);

        return trim(preg_replace('/\s+/u', ' ', $text));
    }

    /** Sampul buku sebagai data URI JPEG kecil (PDF tetap ringan meski 40 buku). */
    private static function cover(Book $book, int $width): ?string
    {
        if (!$book->cover_path) {
            return null;
        }
        $disk = Storage::disk('public');
        if (!$disk->exists($book->cover_path)) {
            return null;
        }

        return self::image($disk->path($book->cover_path), $width, 'jpeg');
    }

    /** Muat gambar apa pun yang didukung GD (WebP/PNG/JPEG), perkecil, lalu jadikan data URI. */
    private static function image(string $path, int $maxWidth, string $format): ?string
    {
        if (!is_file($path)) {
            return null;
        }
        $src = @imagecreatefromstring((string) file_get_contents($path));
        if (!$src) {
            return null;
        }
        $w = imagesx($src);
        $h = imagesy($src);
        $nw = min($w, $maxWidth);
        $nh = (int) round($h * $nw / $w);
        $dst = imagecreatetruecolor($nw, $nh);
        if ($format === 'png') {
            imagealphablending($dst, false);
            imagesavealpha($dst, true);
            imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
        } else {
            imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));
        }
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);

        ob_start();
        $format === 'png' ? imagepng($dst, null, 7) : imagejpeg($dst, null, 84);
        $bin = (string) ob_get_clean();
        imagedestroy($src);
        imagedestroy($dst);

        return "data:image/{$format};base64," . base64_encode($bin);
    }

    /** QR berwarna hijau tua merek, sebagai data URI PNG. */
    private static function qr(string $url): string
    {
        $values = [];
        foreach ((new \ReflectionClass(QRMatrix::class))->getConstants() as $name => $value) {
            if (str_starts_with($name, 'M_') && is_int($value)) {
                $values[$value] = ($value & QRMatrix::IS_DARK) === QRMatrix::IS_DARK ? self::INK : [255, 255, 255];
            }
        }

        return (new QRCode(new QROptions([
            'outputInterface' => QRGdImagePNG::class,
            'outputBase64' => true,
            'eccLevel' => EccLevel::M,
            'scale' => 6,
            'quietzoneSize' => 1,
            'moduleValues' => $values,
        ])))->render($url);
    }

    /** Path font merek (Space Grotesk untuk judul, Inter untuk isi). */
    private static function fonts(): array
    {
        $p = fn (string $f) => str_replace('\\', '/', resource_path("fonts/{$f}"));

        return [
            'display' => $p('space-grotesk-700.ttf'),
            'displayMedium' => $p('space-grotesk-500.ttf'),
            'body' => $p('inter-400.ttf'),
            'bodySemi' => $p('inter-600.ttf'),
            'bodyBold' => $p('inter-700.ttf'),
        ];
    }
}
