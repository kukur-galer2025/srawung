<?php

namespace App\Services;

use App\Models\Book;
use App\Models\BookPage;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * "Cari di dalam semua buku" — mesin pencari teks penuh buatan sendiri.
 *
 *  1. Tokenisasi  : huruf kecil, buang tanda baca & kata umum, stemming ringan (-nya, -lah, -kah).
 *  2. Indeks      : inverted index kata → halaman (search_postings) + kosakata (search_terms).
 *  3. Peringkat   : Okapi BM25 per halaman (k1 = 1.2, b = 0.75), ditambah bonus bila halaman
 *                   memuat SEMUA kata yang dicari dan bila frasanya muncul utuh.
 *  4. Per buku    : skor buku = halaman terbaik + ½ halaman ke-2 + ¼ halaman ke-3, plus bonus
 *                   bila kata dicari ada di judul/sinopsis.
 *  5. Salah ketik : kata yang tidak dikenal dikoreksi ke kata terdekat (jarak Levenshtein)
 *                   yang paling sering muncul — "elokuent" → "eloquent".
 */
class BookSearch
{
    private const K1 = 1.2;
    private const B = 0.75;
    private const MAX_TERMS = 8;
    private const SNIPPET = 90; // karakter di kiri/kanan kata yang ditemukan

    private const STOPWORDS = [
        'dan', 'yang', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'ini', 'itu', 'atau', 'dalam', 'adalah', 'sebagai',
        'juga', 'akan', 'bisa', 'oleh', 'para', 'agar', 'tidak', 'lebih', 'secara', 'setiap', 'serta', 'ada', 'kita',
        'anda', 'kamu', 'kami', 'saya', 'ia', 'dia', 'mereka', 'sudah', 'telah', 'belum', 'masih', 'saat', 'jika', 'bila',
        'karena', 'maka', 'namun', 'tetapi', 'tapi', 'hanya', 'sangat', 'lagi', 'pun', 'tersebut', 'yaitu', 'yakni',
        'cara', 'apa', 'bagaimana', 'mengapa', 'kenapa', 'seperti', 'antara', 'tentang', 'hal', 'sehingga', 'dapat',
        'the', 'and', 'for', 'with', 'of', 'to', 'in', 'is', 'are', 'a', 'an', 'on', 'or', 'be', 'as', 'by', 'it', 'this', 'that',
    ];

    /* =========================================================================
     |  Tokenisasi
     * ========================================================================= */

    /** @return list<string> */
    public function tokenize(string $text): array
    {
        $text = mb_strtolower(Str::ascii($text));
        $words = preg_split('/[^a-z0-9]+/', $text, -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $stop = array_flip(self::STOPWORDS);

        $out = [];
        foreach ($words as $w) {
            if (strlen($w) < 2 || strlen($w) > 40 || isset($stop[$w])) {
                continue;
            }
            $out[] = $this->stem($w);
        }

        return $out;
    }

    /** Stemming ringan bahasa Indonesia: partikel & kata ganti akhiran saja (aman, tidak merusak istilah teknis). */
    private function stem(string $w): string
    {
        foreach (['nya', 'lah', 'kah'] as $suffix) {
            if (strlen($w) > strlen($suffix) + 3 && str_ends_with($w, $suffix)) {
                return substr($w, 0, -strlen($suffix));
            }
        }

        return $w;
    }

    /* =========================================================================
     |  Indeks
     * ========================================================================= */

    /** Bangun ulang indeks satu buku dari teks halaman (book_pages.text). */
    public function indexBook(Book $book): int
    {
        DB::transaction(function () use ($book) {
            DB::table('search_postings')->where('book_id', $book->id)->delete();

            $rows = [];
            $flush = function () use (&$rows) {
                if ($rows) {
                    DB::table('search_postings')->insert($rows);
                    $rows = [];
                }
            };

            BookPage::where('book_id', $book->id)->whereNotNull('text')->orderBy('page_number')
                ->select(['id', 'book_id', 'page_number', 'text'])
                ->chunkById(200, function ($pages) use (&$rows, $flush, $book) {
                    foreach ($pages as $page) {
                        $tokens = $this->tokenize((string) $page->text);
                        BookPage::whereKey($page->id)->update(['token_count' => count($tokens)]);
                        foreach (array_count_values($tokens) as $term => $tf) {
                            $rows[] = ['term' => (string) $term, 'book_id' => $book->id, 'book_page_id' => $page->id, 'page_number' => $page->page_number, 'tf' => min($tf, 65535)];
                            if (count($rows) >= 1000) {
                                $flush();
                            }
                        }
                    }
                });
            $flush();
        });

        $this->refreshVocabulary();

        return (int) DB::table('search_postings')->where('book_id', $book->id)->count();
    }

    public function removeBook(Book $book): void
    {
        DB::table('search_postings')->where('book_id', $book->id)->delete();
        $this->refreshVocabulary();
    }

    /** Kosakata + df (jumlah halaman yang memuat kata) — dipakai BM25 & koreksi salah ketik. */
    public function refreshVocabulary(): void
    {
        DB::transaction(function () {
            DB::table('search_terms')->delete();
            DB::statement('INSERT INTO search_terms (term, df) SELECT term, COUNT(*) FROM search_postings GROUP BY term');
        });
        Cache::forget('search:stats');
        // Versi baru → hasil pencarian lama di cache otomatis tidak terpakai.
        Cache::forever('search:version', (int) (microtime(true) * 1000));
    }

    /* =========================================================================
     |  Pencarian
     * ========================================================================= */

    /**
     * @return array{query: string, corrected: ?string, terms: list<string>, total_books: int, books: list<array<string, mixed>>}
     */
    public function search(string $query, int $limit = 12): array
    {
        $query = trim(mb_substr($query, 0, 200));
        $version = (int) Cache::get('search:version', 0);
        $key = 'search:q:' . $version . ':' . md5(mb_strtolower($query) . "|{$limit}");

        return Cache::remember($key, now()->addMinutes(10), fn () => $this->run($query, $limit));
    }

    private function run(string $query, int $limit): array
    {
        $empty = ['query' => $query, 'corrected' => null, 'terms' => [], 'total_books' => 0, 'books' => []];
        $raw = array_slice(array_values(array_unique($this->tokenize($query))), 0, self::MAX_TERMS);
        if (!$raw) {
            return $empty;
        }

        // Koreksi salah ketik: kata yang tidak ada di indeks diganti kata terdekat.
        $df = DB::table('search_terms')->whereIn('term', $raw)->pluck('df', 'term')->all();
        $terms = [];
        $changed = false;
        foreach ($raw as $t) {
            if (isset($df[$t])) {
                $terms[] = $t;
            } elseif ($fix = $this->suggest($t)) {
                $terms[] = $fix['term'];
                $df[$fix['term']] = $fix['df'];
                $changed = true;
            }
        }
        $terms = array_values(array_unique($terms));
        if (!$terms) {
            return $empty;
        }

        ['n' => $n, 'avgdl' => $avgdl] = $this->stats();
        $idf = [];
        foreach ($terms as $t) {
            $d = (int) ($df[$t] ?? 0);
            $idf[$t] = log(1 + ($n - $d + 0.5) / ($d + 0.5));
        }

        $postings = DB::table('search_postings as p')
            ->join('book_pages as bp', 'bp.id', '=', 'p.book_page_id')
            ->join('books as b', 'b.id', '=', 'p.book_id')
            ->where('b.status', 'published')
            ->whereIn('p.term', $terms)
            ->get(['p.term', 'p.book_id', 'p.book_page_id', 'p.page_number', 'p.tf', 'bp.token_count']);

        // BM25 per halaman.
        $pages = [];
        foreach ($postings as $p) {
            $id = $p->book_page_id;
            $dl = max(1, (int) $p->token_count);
            $tf = (int) $p->tf;
            $score = $idf[$p->term] * ($tf * (self::K1 + 1)) / ($tf + self::K1 * (1 - self::B + self::B * $dl / $avgdl));
            $pages[$id] ??= ['book_id' => (int) $p->book_id, 'page' => (int) $p->page_number, 'score' => 0.0, 'matched' => []];
            $pages[$id]['score'] += $score;
            $pages[$id]['matched'][$p->term] = true;
        }
        if (!$pages) {
            return ['query' => $query, 'corrected' => $changed ? implode(' ', $terms) : null, 'terms' => $terms, 'total_books' => 0, 'books' => []];
        }

        // Halaman yang memuat semua kata lebih relevan daripada yang hanya memuat sebagian.
        $count = count($terms);
        foreach ($pages as &$pg) {
            $coverage = count($pg['matched']) / $count;
            $pg['score'] *= 0.4 + 0.6 * $coverage * $coverage;
        }
        unset($pg);

        // Bonus frasa utuh untuk 60 halaman teratas.
        uasort($pages, fn ($a, $b) => $b['score'] <=> $a['score']);
        $top = array_slice($pages, 0, 60, true);
        $texts = BookPage::whereIn('id', array_keys($top))->pluck('text', 'id');
        $phrase = $count > 1 ? mb_strtolower(trim(preg_replace('/\s+/', ' ', $query))) : null;
        foreach ($top as $id => $pg) {
            if ($phrase && str_contains(mb_strtolower((string) ($texts[$id] ?? '')), $phrase)) {
                $pages[$id]['score'] *= 1.5;
            }
        }

        // Kelompokkan per buku.
        $byBook = [];
        foreach ($pages as $id => $pg) {
            $byBook[$pg['book_id']][$id] = $pg;
        }

        $books = Book::with('category:id,name,slug')->whereIn('id', array_keys($byBook))->get()->keyBy('id');
        $results = [];
        foreach ($byBook as $bookId => $list) {
            $book = $books[$bookId] ?? null;
            if (!$book) {
                continue;
            }
            uasort($list, fn ($a, $b) => $b['score'] <=> $a['score']);
            $scores = array_values(array_column($list, 'score'));
            $score = ($scores[0] ?? 0) + 0.5 * ($scores[1] ?? 0) + 0.25 * ($scores[2] ?? 0);

            $meta = array_flip($this->tokenize($book->title . ' ' . $book->synopsis));
            $metaHits = count(array_filter($terms, fn ($t) => isset($meta[$t])));
            $score *= 1 + 0.25 * $metaHits / $count;

            // Cakupan per buku: buku yang tidak memuat semua kata yang dicari (di halaman mana pun) diturunkan.
            $covered = [];
            foreach ($list as $pg) {
                $covered += $pg['matched'];
            }
            $bookCoverage = count($covered) / $count;
            $score *= 0.3 + 0.7 * $bookCoverage * $bookCoverage;

            $results[] = ['book' => $book, 'score' => $score, 'hits' => count($list), 'top' => array_slice($list, 0, 3, true)];
        }
        usort($results, fn ($a, $b) => $b['score'] <=> $a['score']);
        // Buang buku yang hanya kebetulan memuat kata umum (skor < 20% dari hasil teratas).
        $best = $results[0]['score'] ?? 0;
        $results = array_values(array_filter($results, fn ($r) => $r['score'] >= 0.2 * $best));
        $total = count($results);
        $results = array_slice($results, 0, $limit);

        // Cuplikan teks untuk halaman yang ditampilkan.
        $needIds = array_merge(...array_map(fn ($r) => array_keys($r['top']), $results ?: [['top' => []]]));
        $pageTexts = BookPage::whereIn('id', $needIds)->pluck('text', 'id');
        $highlight = $this->highlightWords($query, $terms);

        return [
            'query' => $query,
            'corrected' => $changed ? implode(' ', $terms) : null,
            'terms' => $highlight,
            'total_books' => $total,
            'books' => array_map(function ($r) use ($pageTexts, $highlight) {
                /** @var Book $b */
                $b = $r['book'];

                return [
                    'id' => $b->id,
                    'title' => $b->title,
                    'slug' => $b->slug,
                    'author' => $b->author,
                    'cover_url' => $b->cover_url,
                    'price' => (int) $b->price,
                    'effective_price' => $b->currentPrice(),
                    'is_on_sale' => $b->saleActive(),
                    'category' => $b->category?->only(['name', 'slug']),
                    'preview_pages' => (int) $b->preview_pages,
                    'hits' => $r['hits'],
                    'score' => round($r['score'], 3),
                    'pages' => array_values(array_map(fn ($id) => [
                        'page' => $r['top'][$id]['page'],
                        'free' => $r['top'][$id]['page'] <= (int) $b->preview_pages,
                        'snippet' => $this->snippet((string) ($pageTexts[$id] ?? ''), $highlight),
                    ], array_keys($r['top']))),
                ];
            }, $results),
        ];
    }

    /** @return array{n: int, avgdl: float} */
    private function stats(): array
    {
        return Cache::remember('search:stats', now()->addHour(), function () {
            $row = DB::table('book_pages as bp')
                ->join('books as b', 'b.id', '=', 'bp.book_id')
                ->where('b.status', 'published')
                ->where('bp.token_count', '>', 0)
                ->selectRaw('COUNT(*) as n, AVG(bp.token_count) as avgdl')
                ->first();

            return ['n' => max(1, (int) ($row->n ?? 0)), 'avgdl' => max(1.0, (float) ($row->avgdl ?? 1))];
        });
    }

    /** @return array{term: string, df: int}|null */
    private function suggest(string $term): ?array
    {
        $len = strlen($term);
        if ($len < 4) {
            return null;
        }
        $max = $len <= 5 ? 1 : 2;

        $candidates = DB::table('search_terms')
            ->where('term', 'like', substr($term, 0, 1) . '%')
            ->whereRaw('LENGTH(term) BETWEEN ? AND ?', [$len - $max, $len + $max])
            ->orderByDesc('df')
            ->limit(3000)
            ->get(['term', 'df']);

        $best = null;
        foreach ($candidates as $c) {
            $d = levenshtein($term, $c->term);
            if ($d <= $max && ($best === null || $d < $best['d'] || ($d === $best['d'] && $c->df > $best['df']))) {
                $best = ['term' => $c->term, 'df' => (int) $c->df, 'd' => $d];
            }
        }

        return $best ? ['term' => $best['term'], 'df' => $best['df']] : null;
    }

    /**
     * Kata asli dari kueri (sebelum stemming) + kata hasil koreksi — untuk penanda kuning.
     *
     * @param  list<string>  $terms
     * @return list<string>
     */
    private function highlightWords(string $query, array $terms): array
    {
        $words = preg_split('/[^a-z0-9]+/', mb_strtolower(Str::ascii($query)), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $words = array_filter($words, fn ($w) => strlen($w) >= 2 && !in_array($w, self::STOPWORDS, true));

        return array_values(array_unique([...$terms, ...$words]));
    }

    /** @param list<string> $words */
    private function snippet(string $text, array $words): string
    {
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
        // Judul berjalan di tepi halaman PDF berhuruf renggang ("L A R AV E L D A R I", "B A B 5 ·") — bukan isi.
        $text = preg_replace('/(?<!\S)(?:[\p{L}\d]{1,2}[,.]?(?:\s+[·,])?\s+){3,}(?:[\p{L}\d]{1,2}(?!\S))?/u', ' ', $text) ?? $text;
        $text = preg_replace('/(?:\s*[·,…]\s*){2,}/u', ' · ', $text) ?? $text;
        $text = trim(preg_replace('/^[\s·,]+|\s{2,}/u', ' ', $text) ?? $text);
        $lower = mb_strtolower($text);
        $pos = null;
        foreach ($words as $w) {
            if (preg_match('/\b' . preg_quote($w, '/') . '/u', $lower, $m, PREG_OFFSET_CAPTURE)) {
                $p = mb_strlen(substr($lower, 0, $m[0][1]));
                $pos = $pos === null ? $p : min($pos, $p);
            }
        }
        $pos ??= 0;

        $start = max(0, $pos - self::SNIPPET);
        $snippet = mb_substr($text, $start, self::SNIPPET * 2 + 40);
        // Potong di batas kata agar rapi.
        if ($start > 0) {
            $snippet = '…' . ltrim(preg_replace('/^\S*\s/u', '', $snippet) ?? $snippet);
        }
        if ($start + mb_strlen($snippet) < mb_strlen($text)) {
            $snippet = rtrim(preg_replace('/\s\S*$/u', '', $snippet) ?? $snippet) . '…';
        }

        return $snippet;
    }
}
