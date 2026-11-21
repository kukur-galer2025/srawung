<?php

namespace App\Services;

use App\Models\Book;
use App\Models\Category;
use App\Models\User;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Pencarian instan (saran saat mengetik) yang dipersonalisasi.
 *
 * Skor akhir tiap buku = gabungan berbobot dari:
 *  - Relevansi teks   (BM25F + koreksi salah ketik dari CatalogSearch, dinormalisasi 0..1) — penentu utama;
 *  - Minat pembaca    (afinitas kategori + kemiripan TF-IDF dengan buku yang dimiliki/dilihat,
 *                      dari Recommender::readerProfile — login maupun tamu);
 *  - Umpan balik klik (buku yang paling sering dipilih orang untuk kata kunci yang sama,
 *                      dengan smoothing agar 1–2 klik tidak mendominasi);
 *  - Tren             (pembelian & kunjungan 30 hari, meluruh eksponensial).
 * Bobot minat hanya dipakai bila ada sinyal; tanpa sinyal bobotnya kembali ke relevansi teks.
 *
 * Kotak pencarian kosong menampilkan: pencarian populer, rekomendasi untuk Anda, dan
 * kategori yang diurutkan menurut minat.
 */
class SmartSearch
{
    private const W_TEXT = 0.60;
    private const W_PERSONAL = 0.20;
    private const W_CLICKS = 0.12;
    private const W_TREND = 0.08;

    /** Pseudo-count untuk smoothing bagian klik: share = klik / (total + K). */
    private const CLICK_SMOOTHING = 5;

    public function __construct(private CatalogSearch $catalog, private Recommender $recommender) {}

    /**
     * @param  list<int>  $seen  buku terakhir dilihat di perangkat (tamu)
     * @param  list<int>  $prefs  topik favorit tamu
     */
    public function suggest(string $q, ?User $user, array $seen = [], array $prefs = [], int $limit = 6): array
    {
        $q = trim(mb_substr($q, 0, 100));
        $norm = self::normalize($q);
        $profile = $this->recommender->readerProfile($user, $seen, $prefs);
        $ranked = $this->catalog->search($q);

        // Kandidat teks: hasil BM25F; kueri tanpa kata bermakna → pencocokan judul/penulis biasa.
        $text = $ranked['scores'] ?? [];
        if ($ranked === null) {
            $text = Book::where('status', 'published')
                ->where(fn ($w) => $w->where('title', 'like', "%{$q}%")->orWhere('author', 'like', "%{$q}%"))
                ->limit(30)->pluck('id')->mapWithKeys(fn ($id) => [$id => 1.0])->all();
        }
        $text = array_slice($text, 0, 30, true);
        $top = max(1e-9, ...array_values($text ?: [0]));

        $clicks = $norm !== '' ? DB::table('search_clicks')->where('query', $norm)->pluck('clicks', 'book_id')->all() : [];
        $clickTotal = array_sum($clicks);
        $trend = $this->recommender->trendingScores();
        $books = Book::with('category:id,name,slug')->whereIn('id', array_keys($text))->where('status', 'published')->get()->keyBy('id');

        $rows = [];
        foreach ($text as $id => $score) {
            if (!$b = $books[$id] ?? null) {
                continue;
            }
            $t = $score / $top;
            $cat = $profile['catAffinity'][$b->category_id] ?? 0.0;
            $content = $this->recommender->contentAffinity($profile['profile'], $id);
            $personal = $profile['personalized'] ? 0.45 * $cat + 0.4 * $content + 0.15 * $this->recommender->qualityOf($b) : 0.0;
            $click = ($clicks[$id] ?? 0) / ($clickTotal + self::CLICK_SMOOTHING);
            $tr = $trend[$id] ?? 0.0;

            $wText = self::W_TEXT + ($profile['personalized'] ? 0 : self::W_PERSONAL);
            $final = $wText * $t + self::W_PERSONAL * $personal + self::W_CLICKS * min(1, $click * 2) + self::W_TREND * $tr;

            $rows[] = [
                'book' => $b,
                'score' => $final,
                'reason' => $this->reason($b, $profile, $cat, $content, $clicks[$id] ?? 0, $click, $tr),
            ];
        }
        usort($rows, fn ($a, $b) => $b['score'] <=> $a['score']);

        return [
            'query' => $q,
            'corrected' => $ranked['corrected'] ?? null,
            'personalized' => $profile['personalized'],
            'books' => array_map(fn ($r) => $this->present($r['book'], $r['reason'], $profile['owned']), array_slice($rows, 0, $limit)),
            'total' => count($rows),
            'categories' => $this->matchingCategories($q, $profile['catAffinity']),
            'authors' => $this->matchingAuthors($q),
            'queries' => $this->completions($norm),
        ];
    }

    /** Isi panel saat kotak pencarian masih kosong. */
    public function discover(?User $user, array $seen = [], array $prefs = []): array
    {
        $rec = $this->recommender->forReader($user, $seen, 4, $prefs);
        $profile = $this->recommender->readerProfile($user, $seen, $prefs);

        $categories = Category::withCount(['books' => fn ($q) => $q->where('status', 'published')])->get()
            ->filter(fn ($c) => $c->books_count > 0)
            ->sortByDesc(fn ($c) => [round($profile['catAffinity'][$c->id] ?? 0, 3), $c->books_count])
            ->take(6)
            ->map(fn ($c) => ['name' => $c->name, 'slug' => $c->slug, 'count' => $c->books_count, 'preferred' => ($profile['catAffinity'][$c->id] ?? 0) >= 0.5])
            ->values();

        return [
            'personalized' => $rec['personalized'],
            'trending' => $this->trendingQueries(),
            'for_you' => $rec['items']->map(fn ($i) => $this->present($i['book'], $i['reason'], $profile['owned']))->values(),
            'categories' => $categories,
        ];
    }

    /** Catat buku yang dipilih dari hasil pencarian (sekali per pengunjung per kueri per hari). */
    public static function recordClick(string $q, int $bookId, string $visitor): void
    {
        $norm = self::normalize($q);
        if (mb_strlen($norm) < 2 || !Book::whereKey($bookId)->where('status', 'published')->exists()) {
            return;
        }
        if (!Cache::add('search-click:' . md5("{$visitor}|{$norm}|{$bookId}"), 1, now()->endOfDay())) {
            return;
        }
        DB::table('search_clicks')->upsert(
            [['query' => $norm, 'book_id' => $bookId, 'clicks' => 1, 'last_clicked_at' => now()]],
            ['query', 'book_id'],
            ['clicks' => DB::raw('clicks + 1'), 'last_clicked_at' => now()],
        );
    }

    public static function normalize(string $q): string
    {
        return mb_substr(trim((string) preg_replace('/\s+/u', ' ', mb_strtolower($q))), 0, 100);
    }

    /* ------------------------------------------------------------------ */

    private function reason(Book $b, array $profile, float $cat, float $content, int $clicks, float $clickShare, float $trend): ?string
    {
        if (isset($profile['owned'][$b->id])) {
            return 'Ada di perpustakaan Anda';
        }
        if ($clicks >= 3 && $clickShare >= 0.3) {
            return 'Paling sering dipilih untuk pencarian ini';
        }
        if ($profile['personalized'] && $content >= 0.2) {
            return 'Mirip buku yang Anda minati';
        }
        if ($profile['personalized'] && $cat >= 0.6 && $b->category) {
            return 'Sesuai minat Anda: ' . $b->category->name;
        }
        if ($trend >= 0.4) {
            return 'Sedang populer';
        }

        return null;
    }

    private function present(Book $b, ?string $reason, array $owned): array
    {
        $widths = $b->cover_meta['w'] ?? [];

        return [
            'id' => $b->id,
            'title' => $b->title,
            'slug' => $b->slug,
            'author' => $b->author,
            // Varian terkecil cukup untuk thumbnail 40 px (retina) di daftar saran.
            'thumb' => $widths ? Str::of((string) $b->cover_srcset)->before(' ')->toString() : $b->cover_url,
            'placeholder' => $b->cover_placeholder,
            'price' => (int) $b->price,
            'effective_price' => $b->currentPrice(),
            'is_on_sale' => $b->saleActive(),
            'category' => $b->category?->name,
            'owned' => isset($owned[$b->id]),
            'reason' => $reason,
        ];
    }

    private function matchingCategories(string $q, array $affinity): array
    {
        if (mb_strlen($q) < 2) {
            return [];
        }

        return Category::where('name', 'like', "%{$q}%")
            ->withCount(['books' => fn ($w) => $w->where('status', 'published')])->get()
            ->filter(fn ($c) => $c->books_count > 0)
            ->sortByDesc(fn ($c) => $affinity[$c->id] ?? 0)
            ->take(3)
            ->map(fn ($c) => ['name' => $c->name, 'slug' => $c->slug, 'count' => $c->books_count])
            ->values()->all();
    }

    private function matchingAuthors(string $q): array
    {
        if (mb_strlen($q) < 3) {
            return [];
        }

        return Book::where('status', 'published')->where('author', 'like', "%{$q}%")
            ->groupBy('author')->selectRaw('author, COUNT(*) c')->orderByDesc('c')->limit(3)->get()
            ->map(fn ($r) => ['name' => $r->author, 'count' => (int) $r->c])->all();
    }

    /** Lengkapi kueri dari pencarian populer yang berhasil (diawali teks yang diketik). */
    private function completions(string $norm): array
    {
        if (mb_strlen($norm) < 2) {
            return [];
        }

        $list = DB::table('search_query_daily')->where('date', '>=', now()->subDays(60)->toDateString())
            ->where('query', 'like', str_replace(['%', '_'], ['\%', '\_'], $norm) . '%')->where('query', '!=', $norm)
            ->groupBy('query')->havingRaw('MAX(results) > 0')
            ->selectRaw('query, SUM(searches) s')->orderByDesc('s')->limit(8)->pluck('query')->all();

        // Tampilkan bentuk yang benar ("laravell" → "laravel"); buang yang sama dengan ketikan sekarang.
        $list = array_map(fn ($q) => $this->catalog->search($q)['corrected'] ?? $q, $list);

        return array_slice(array_values(array_unique(array_filter($list, fn ($q) => $q !== $norm))), 0, 4);
    }

    private function trendingQueries(): array
    {
        return Cache::remember('search:trending-queries', now()->addMinutes(10), function () {
            $list = DB::table('search_query_daily')
                ->where('date', '>=', now()->subDays(7)->toDateString())
                ->whereRaw('LENGTH(query) >= 3') // LENGTH: tersedia di MySQL & SQLite (tes)
                ->groupBy('query')->havingRaw('MAX(results) > 0')
                ->selectRaw('query, SUM(searches) s')->orderByDesc('s')->limit(20)->pluck('query')->all();

            // Tampilkan bentuk yang benar ("laravell" → "laravel"), lalu buang duplikat.
            $list = array_values(array_unique(array_map(fn ($q) => $this->catalog->search($q)['corrected'] ?? $q, $list)));
            // Buang potongan ketikan ("lara") bila versi lengkapnya ("laravel") juga populer.
            $kept = array_values(array_filter($list, fn ($q) => !array_filter($list, fn ($o) => $o !== $q && str_starts_with($o, $q))));

            return array_slice($kept, 0, 6);
        });
    }
}
