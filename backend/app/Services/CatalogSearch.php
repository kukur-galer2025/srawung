<?php

namespace App\Services;

use App\Models\Book;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Pencarian katalog (judul, penulis, kategori, sinopsis) dengan peringkat relevansi.
 *
 *  1. Tokenisasi  : sama dengan "cari di dalam buku" (huruf kecil, buang kata umum, stemming ringan).
 *  2. Peringkat   : BM25F — BM25 dengan bobot per kolom: judul 3×, penulis & kategori 2×, sinopsis 1×,
 *                   masing-masing dinormalisasi panjang kolomnya.
 *  3. Variasi kata: tiap kata yang dicari boleh cocok lewat
 *                   - kata persis (bobot 1),
 *                   - awalan kata saat pengguna belum selesai mengetik, "pyth" → "python" (0,75),
 *                   - koreksi salah ketik (jarak Levenshtein), "pyton" → "python" (0,9),
 *                   - sinonim kecil yang umum di katalog, "utbk" ↔ "snbt" (0,6).
 *  4. Cakupan     : buku yang memuat SEMUA kata dicari naik; yang hanya sebagian turun.
 *  5. Bonus frasa : frasa utuh di judul (×1,6, ×2 bila judul diawali frasa itu) atau di penulis (×1,4).
 *  6. Ambang      : buku dengan skor < 15% dari hasil teratas dibuang (kebetulan cocok kata umum).
 *
 * Indeks katalog dibangun di memori lalu di-cache; otomatis dibangun ulang saat buku/kategori berubah.
 */
class CatalogSearch
{
    private const K1 = 1.2;
    private const B = 0.75;
    private const MAX_TERMS = 8;
    private const MIN_RELATIVE_SCORE = 0.15;

    /** Bobot kolom BM25F. */
    private const FIELDS = ['title' => 3.0, 'author' => 2.0, 'category' => 2.0, 'synopsis' => 1.0];

    /** Sinonim/singkatan yang sering dipakai pembeli (dua arah ditulis eksplisit). */
    private const SYNONYMS = [
        'js' => ['javascript'], 'javascript' => ['js'],
        'ts' => ['typescript'], 'typescript' => ['ts'],
        'py' => ['python'],
        'golang' => ['go'], 'go' => ['golang'],
        'ai' => ['kecerdasan', 'artificial'], 'kecerdasan' => ['ai'],
        'uiux' => ['ui', 'ux'], 'ui' => ['ux', 'desain'], 'ux' => ['ui', 'desain'],
        'design' => ['desain'], 'desain' => ['design'],
        'web' => ['website'], 'website' => ['web'],
        'cpns' => ['skd', 'asn'], 'asn' => ['cpns'], 'skd' => ['cpns'],
        'utbk' => ['snbt'], 'snbt' => ['utbk'],
        'prompt' => ['prompting'], 'prompting' => ['prompt'],
        'data' => ['analisis'],
    ];

    public function __construct(private BookSearch $tokenizer) {}

    /**
     * @return array{scores: array<int, float>, corrected: ?string, terms: list<string>}|null
     *         null bila kueri tidak berisi kata bermakna (mis. hanya "cara") → pemanggil memakai pencarian biasa.
     */
    public function search(string $query): ?array
    {
        $query = trim(mb_substr($query, 0, 200));
        $raw = array_slice(array_values(array_unique($this->tokenizer->tokenize($query))), 0, self::MAX_TERMS);
        if (!$raw) {
            return null;
        }

        $index = $this->index();
        $vocab = $index['df'];
        $concepts = [];
        $corrections = [];

        foreach ($raw as $term) {
            $variants = [];
            if (isset($vocab[$term])) {
                $variants[$term] = 1.0;
            }
            // Awalan: pengguna belum selesai mengetik ("pyth", "lara").
            if (strlen($term) >= 3) {
                foreach ($this->prefixMatches($term, $vocab) as $v) {
                    $variants[$v] ??= 0.75;
                }
            }
            $synonyms = function (array $bases) use (&$variants, $vocab) {
                foreach ($bases as $base) {
                    foreach (self::SYNONYMS[$base] ?? [] as $syn) {
                        if (isset($vocab[$syn])) {
                            $variants[$syn] ??= 0.6;
                        }
                    }
                }
            };
            $synonyms([$term, ...array_keys($variants)]);
            // Salah ketik: hanya bila kata itu (dan sinonimnya) sama sekali tidak dikenal.
            if (!$variants && ($fix = $this->closest($term, $vocab))) {
                $variants[$fix] = 0.9;
                $corrections[$term] = $fix;
                $synonyms([$fix]);
            }
            $concepts[] = $variants; // bisa kosong: kata yang tidak dikenal sama sekali tetap menurunkan cakupan
        }

        if (!array_filter($concepts)) {
            return ['scores' => [], 'corrected' => null, 'terms' => $raw];
        }

        $n = max(1, count($index['books']));
        $scores = [];
        $matched = [];
        foreach ($concepts as $ci => $variants) {
            $best = [];
            foreach ($variants as $term => $weight) {
                $df = $vocab[$term];
                $idf = log(1 + ($n - $df + 0.5) / ($df + 0.5));
                foreach ($index['postings'][$term] ?? [] as $bookId => $fieldTf) {
                    $score = $weight * $idf * $this->saturate($fieldTf, $index['books'][$bookId], $index['avg']);
                    if ($score > ($best[$bookId] ?? 0)) {
                        $best[$bookId] = $score;
                    }
                }
            }
            foreach ($best as $bookId => $s) {
                $scores[$bookId] = ($scores[$bookId] ?? 0) + $s;
                $matched[$bookId][$ci] = true;
            }
        }

        $total = count($concepts);
        $phrase = $this->normalize($query);
        foreach ($scores as $bookId => &$score) {
            $coverage = count($matched[$bookId]) / $total;
            $score *= 0.3 + 0.7 * $coverage * $coverage;

            $meta = $index['books'][$bookId];
            if (mb_strlen($phrase) >= 3) {
                if (str_starts_with($meta['title_norm'], $phrase)) {
                    $score *= 2.0;
                } elseif (str_contains($meta['title_norm'], $phrase)) {
                    $score *= 1.6;
                } elseif (str_contains($meta['author_norm'], $phrase)) {
                    $score *= 1.4;
                }
            }
        }
        unset($score);

        arsort($scores);
        $top = reset($scores) ?: 0;
        $scores = array_filter($scores, fn ($s) => $s >= self::MIN_RELATIVE_SCORE * $top);

        $corrected = null;
        if ($corrections) {
            $words = preg_split('/\s+/', $this->normalize($query), -1, PREG_SPLIT_NO_EMPTY) ?: [];
            $corrected = implode(' ', array_map(fn ($w) => $corrections[$w] ?? $w, $words));
        }

        return [
            'scores' => array_map(fn ($s) => round($s, 4), $scores),
            'corrected' => $corrected,
            'terms' => $raw,
        ];
    }

    /**
     * Catat pencarian (agregat per hari) untuk laporan admin. Pencarian yang sama dari
     * pengunjung yang sama dalam 30 menit dihitung sekali (mis. saat ganti urutan/filter).
     */
    public function log(string $query, int $results, string $visitor): void
    {
        $q = mb_substr(trim((string) preg_replace('/\s+/u', ' ', mb_strtolower($query))), 0, 100);
        if (mb_strlen($q) < 2 || !Cache::add('search-log:' . md5($visitor . '|' . $q), 1, now()->addMinutes(30))) {
            return;
        }

        try {
            DB::table('search_query_daily')->upsert(
                [['date' => now()->toDateString(), 'query' => $q, 'searches' => 1, 'results' => $results, 'last_searched_at' => now()]],
                ['date', 'query'],
                ['searches' => DB::raw('searches + 1'), 'results' => $results, 'last_searched_at' => now()],
            );
        } catch (\Throwable $e) {
            report($e); // pencatatan tidak boleh menggagalkan pencarian
        }
    }

    /* ------------------------------------------------------------------ */

    /**
     * BM25F: frekuensi per kolom dibobot & dinormalisasi panjang kolom, lalu dijenuhkan sekali.
     *
     * @param  array<string, int>  $fieldTf
     */
    private function saturate(array $fieldTf, array $book, array $avg): float
    {
        $tf = 0.0;
        foreach ($fieldTf as $field => $count) {
            $norm = 1 - self::B + self::B * ($book['len'][$field] / max(1.0, $avg[$field]));
            $tf += self::FIELDS[$field] * $count / $norm;
        }

        return $tf * (self::K1 + 1) / ($tf + self::K1);
    }

    /** @return list<string> maks. 5 kata katalog yang diawali $term, paling umum dulu */
    private function prefixMatches(string $term, array $vocab): array
    {
        $out = [];
        foreach ($vocab as $word => $df) {
            $word = (string) $word;
            if ($word !== $term && str_starts_with($word, $term)) {
                $out[$word] = $df;
            }
        }
        arsort($out);

        return array_slice(array_keys($out), 0, 5);
    }

    /**
     * Kata katalog terdekat (Levenshtein ≤ 1 untuk 4–5 huruf, ≤ 2 untuk ≥ 6 huruf).
     * Huruf pertama harus sama: salah ketik jarang terjadi di huruf awal, dan ini mencegah
     * koreksi ngawur seperti "masakan" → "sasaran" atau "golang" → "lang".
     */
    private function closest(string $term, array $vocab): ?string
    {
        $len = strlen($term);
        if ($len < 4) {
            return null;
        }
        $max = $len <= 5 ? 1 : 2;
        $best = null;
        $bestD = PHP_INT_MAX;
        $bestDf = -1;
        foreach ($vocab as $word => $df) {
            $word = (string) $word;
            if ($word[0] !== $term[0] || abs(strlen($word) - $len) > $max) {
                continue;
            }
            $d = levenshtein($term, $word);
            if ($d <= $max && ($d < $bestD || ($d === $bestD && $df > $bestDf))) {
                [$best, $bestD, $bestDf] = [$word, $d, $df];
            }
        }

        return $best;
    }

    private function normalize(string $text): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/', ' ', mb_strtolower(Str::ascii($text))));
    }

    /**
     * Indeks katalog: postings[kata][book_id][kolom] = frekuensi, df[kata] = jumlah buku,
     * panjang tiap kolom per buku & rata-ratanya. Hanya array → aman di-cache.
     */
    private function index(): array
    {
        $version = Book::where('status', 'published')->selectRaw('COUNT(*) c, MAX(updated_at) u')->first();
        $catVersion = DB::table('categories')->max('updated_at');
        $key = 'catalog-search:' . md5(($version->c ?? 0) . '|' . ($version->u ?? '') . '|' . $catVersion);

        return Cache::remember($key, now()->addHours(6), function () {
            $books = Book::with('category:id,name')->where('status', 'published')
                ->get(['id', 'title', 'author', 'synopsis', 'category_id']);

            $postings = [];
            $meta = [];
            $sum = array_fill_keys(array_keys(self::FIELDS), 0);
            foreach ($books as $b) {
                $fields = [
                    'title' => $b->title,
                    'author' => $b->author,
                    'category' => $b->category?->name ?? '',
                    'synopsis' => strip_tags((string) $b->synopsis),
                ];
                $len = [];
                foreach ($fields as $field => $text) {
                    $tokens = $this->tokenizer->tokenize((string) $text);
                    $len[$field] = count($tokens);
                    $sum[$field] += count($tokens);
                    foreach (array_count_values($tokens) as $term => $tf) {
                        $postings[(string) $term][$b->id][$field] = $tf;
                    }
                }
                $meta[$b->id] = ['len' => $len, 'title_norm' => $this->normalize($b->title), 'author_norm' => $this->normalize((string) $b->author)];
            }

            $count = max(1, $books->count());

            return [
                'postings' => $postings,
                'df' => array_map('count', $postings),
                'books' => $meta,
                'avg' => array_map(fn ($s) => $s / $count, $sum),
            ];
        });
    }
}
