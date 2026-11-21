<?php

namespace App\Services;

use App\Models\Book;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Mesin rekomendasi buku hibrida.
 *
 *  1. Kemiripan isi (content-based)  — vektor TF-IDF dari judul, kategori, dan sinopsis,
 *     dibandingkan dengan cosine similarity.
 *  2. Collaborative filtering        — "pembaca yang memiliki X juga memiliki Y"
 *     (ko-okurensi kepemilikan di perpustakaan).
 *  3. Afinitas kategori              — dari buku yang dimiliki, dibaca, dilihat, dan topik
 *     favorit yang dipilih pembaca sendiri.
 *  4. Tren dengan peluruhan waktu    — pembelian & kunjungan terbaru bernilai lebih tinggi
 *     (exponential decay, waktu paruh ±5 hari).
 *  5. Diversifikasi (MMR)            — hasil akhir tidak didominasi satu kategori/topik.
 *
 * Setiap rekomendasi membawa "alasan" yang bisa ditampilkan ke pembaca.
 */
class Recommender
{
    /** Kata umum bahasa Indonesia/Inggris yang tidak membawa makna topik. */
    private const STOPWORDS = [
        'dan', 'yang', 'di', 'ke', 'dari', 'untuk', 'dengan', 'pada', 'ini', 'itu', 'atau', 'dalam', 'adalah', 'sebagai',
        'juga', 'akan', 'bisa', 'oleh', 'para', 'agar', 'hingga', 'sampai', 'tidak', 'lebih', 'secara', 'setiap', 'serta',
        'bab', 'kuis', 'soal', 'seri', 'panduan', 'lengkap', 'buku', 'anda', 'kamu', 'kita', 'cara', 'langkah', 'demi',
        'amania', 'press', 'tim', 'redaksi', 'edisi', 'dari', 'nol', 'pemula', 'mahir', 'baru', 'terbaru', 'sendiri',
        'the', 'and', 'for', 'with', 'of', 'to', 'in', 'a', 'an',
    ];

    private const PUBLIC_HIDDEN = ['source_file_path', 'processing_status', 'processing_error'];

    /* =========================================================================
     |  API publik
     * ========================================================================= */

    /**
     * Buku yang mirip dengan $book ("Pembaca buku ini juga menyukai").
     *
     * @return Collection<int, array{book: Book, score: float, reason: string}>
     */
    public function similar(Book $book, int $limit = 6): Collection
    {
        $books = $this->catalog();
        $vectors = $this->vectors();
        $co = $this->coOwnership($book->id);
        $coMax = max(1, ...array_values($co ?: [0]));
        $trend = $this->trendingScores();

        $scored = $books->where('id', '!=', $book->id)->map(function (Book $b) use ($book, $vectors, $co, $coMax, $trend) {
            $content = $this->cosine($vectors[$book->id] ?? [], $vectors[$b->id] ?? []);
            $collab = ($co[$b->id] ?? 0) / $coMax;
            $sameCat = $b->category_id && $b->category_id === $book->category_id ? 1.0 : 0.0;

            $score = 0.42 * $content + 0.28 * $collab + 0.20 * $sameCat + 0.05 * ($trend[$b->id] ?? 0) + 0.05 * $this->quality($b);

            $reason = match (true) {
                $collab >= 0.5 => 'Sering dibeli bersama buku ini',
                $content >= 0.15 => 'Topik serupa',
                $sameCat > 0 => 'Kategori yang sama',
                default => 'Mungkin Anda suka',
            };

            return ['book' => $b, 'score' => $score, 'reason' => $reason];
        });

        return $this->diversify($scored->values(), $limit, $vectors);
    }

    /**
     * Rekomendasi personal untuk pembaca (login maupun tamu).
     *
     * @param  array<int, int>  $seenIds  buku yang baru dilihat di perangkat ini (dikirim browser)
     * @param  array<int, int>  $guestPrefs  topik favorit tamu (disimpan di browser; diabaikan bila login)
     * @return array{personalized: bool, items: Collection<int, array{book: Book, score: float, reason: string}>}
     */
    public function forReader(?User $user, array $seenIds = [], int $limit = 8, array $guestPrefs = []): array
    {
        $books = $this->catalog();
        $byId = $books->keyBy('id');
        $vectors = $this->vectors();
        $trend = $this->trendingScores();

        ['weights' => $weights, 'owned' => $owned, 'preferred' => $preferred, 'personalized' => $personalized,
            'catAffinity' => $catAffinity, 'profile' => $profile] = $this->readerProfile($user, $seenIds, $guestPrefs);

        // ---------- 3. Skor kandidat ----------
        $scored = $books
            ->reject(fn (Book $b) => isset($owned[$b->id]))
            ->map(function (Book $b) use ($personalized, $profile, $vectors, $catAffinity, $trend, $weights, $byId, $preferred) {
                $t = $trend[$b->id] ?? 0;
                if (!$personalized) {
                    return ['book' => $b, 'score' => $t + 0.01, 'reason' => $t > 0.3 ? 'Sedang populer' : 'Pilihan editor'];
                }

                $content = $this->cosine($profile, $vectors[$b->id] ?? []);
                $cat = $catAffinity[$b->category_id] ?? 0;
                $score = 0.38 * $cat + 0.33 * $content + 0.21 * $t + 0.08 * $this->quality($b);

                // Buku yang sudah ada di riwayat diturunkan jauh: rekomendasi harus membawa
                // hal baru, riwayat sendiri sudah tampil di rak "Terakhir dilihat".
                if (isset($weights[$b->id])) {
                    $score = $score * 0.2 - 1;
                }

                return ['book' => $b, 'score' => $score, 'reason' => $this->explain($b, $content, $cat, $t, $weights, $vectors, $byId, $preferred)];
            });

        return [
            'personalized' => $personalized,
            'items' => $this->diversify($scored->values(), $limit, $vectors),
        ];
    }

    /**
     * Profil minat pembaca — dipakai rekomendasi & pencarian yang dipersonalisasi.
     *
     * Sinyal: buku dimiliki (+ seberapa jauh dibaca), kunjungan 60 hari terakhir (meluruh
     * eksponensial, paruh ±2 minggu), riwayat lihat di perangkat, dan topik favorit.
     *
     * @return array{weights: array<int, float>, owned: array<int, bool>, preferred: list<int>, personalized: bool,
     *               catAffinity: array<int, float>, profile: array<string, float>}
     */
    public function readerProfile(?User $user, array $seenIds = [], array $guestPrefs = []): array
    {
        $books = $this->catalog();
        $byId = $books->keyBy('id');
        $vectors = $this->vectors();

        // ---------- 1. Sinyal minat (bobot per buku) ----------
        $weights = [];          // book_id => bobot
        $owned = [];

        if ($user) {
            $library = DB::table('user_library')
                ->where('user_id', $user->id)
                ->where('access_status', 'active')
                ->get(['book_id', 'last_read_page']);
            foreach ($library as $row) {
                $owned[$row->book_id] = true;
                // Dimiliki = sinyal kuat; sudah dibaca jauh = lebih kuat lagi.
                $weights[$row->book_id] = ($weights[$row->book_id] ?? 0) + 3 + min(2, ((int) $row->last_read_page) / 50);
            }

            $views = DB::table('book_views')
                ->where('user_id', $user->id)
                ->where('created_at', '>=', now()->subDays(60))
                ->selectRaw('book_id, COUNT(*) as n, MAX(created_at) as last_at')
                ->groupBy('book_id')
                ->get();
            foreach ($views as $v) {
                $ageDays = max(0, now()->diffInHours($v->last_at, true) / 24);
                $weights[$v->book_id] = ($weights[$v->book_id] ?? 0) + min(3, 1 + log(1 + $v->n)) * exp(-$ageDays / 21);
            }
        }

        foreach (array_slice(array_unique(array_map('intval', $seenIds)), 0, 30) as $i => $id) {
            // Urutan dari browser: yang paling baru dilihat ada di depan.
            $weights[$id] = ($weights[$id] ?? 0) + 1.2 * exp(-$i / 8);
        }

        $weights = array_filter($weights, fn ($w, $id) => $byId->has($id), ARRAY_FILTER_USE_BOTH);
        $preferred = array_values(array_unique(array_map('intval', $user ? (array) ($user->preferred_categories ?? []) : array_slice($guestPrefs, 0, 12))));
        $personalized = $weights !== [] || $preferred !== [];

        // ---------- 2. Afinitas kategori & centroid TF-IDF ----------
        $catAffinity = [];
        foreach ($weights as $id => $w) {
            $cat = $byId[$id]->category_id;
            if ($cat) {
                $catAffinity[$cat] = ($catAffinity[$cat] ?? 0) + $w;
            }
        }
        foreach ($preferred as $cat) {
            $catAffinity[$cat] = ($catAffinity[$cat] ?? 0) + max(2, array_sum($weights) * 0.4);
        }
        $catMax = max(1e-9, ...array_values($catAffinity ?: [0]));
        $catAffinity = array_map(fn ($v) => $v / $catMax, $catAffinity);

        $profile = [];          // centroid vektor TF-IDF berbobot
        foreach ($weights as $id => $w) {
            foreach ($vectors[$id] ?? [] as $term => $val) {
                $profile[$term] = ($profile[$term] ?? 0) + $w * $val;
            }
        }
        $profile = $this->normalize($profile);

        return compact('weights', 'owned', 'preferred', 'personalized', 'catAffinity', 'profile');
    }

    /** Kemiripan isi (cosine TF-IDF) antara profil pembaca dan sebuah buku. */
    public function contentAffinity(array $profile, int $bookId): float
    {
        return $profile ? $this->cosine($profile, $this->vectors()[$bookId] ?? []) : 0.0;
    }

    /** Kualitas 0..1 dari rating (rata-rata Bayesian). */
    public function qualityOf(Book $b): float
    {
        return $this->quality($b);
    }

    /**
     * Buku yang sedang tren.
     *
     * @return Collection<int, array{book: Book, score: float, reason: string}>
     */
    public function trending(int $limit = 8): Collection
    {
        $trend = $this->trendingScores();

        return $this->catalog()
            ->map(fn (Book $b) => ['book' => $b, 'score' => $trend[$b->id] ?? 0, 'reason' => 'Sedang tren'])
            ->sortByDesc('score')
            ->take($limit)
            ->values();
    }

    /** Catat kunjungan halaman buku (deduplikasi 30 menit per pembaca). */
    public function recordView(Book $book, ?User $user, string $fingerprint): void
    {
        $key = 'book-view:' . $book->id . ':' . ($user?->id ?? hash('sha256', $fingerprint . config('app.key')));
        if (!Cache::add($key, 1, now()->addMinutes(30))) {
            return;
        }

        DB::table('book_views')->insert([
            'book_id' => $book->id,
            'user_id' => $user?->id,
            'created_at' => now(),
        ]);
    }

    /* =========================================================================
     |  Komponen algoritma
     * ========================================================================= */

    private ?Collection $catalogMemo = null;

    /**
     * Buku terbit (dimuat sekali per request). Model tidak disimpan ke cache karena
     * Laravel menolak unserialize objek dari cache; yang di-cache hanya array skor/vektor.
     */
    private function catalog(): Collection
    {
        return $this->catalogMemo ??= Book::with('category')
            ->where('status', 'published')
            ->get()
            ->each->makeHidden(self::PUBLIC_HIDDEN);
    }

    private function catalogVersion(): string
    {
        $row = Book::where('status', 'published')->selectRaw('COUNT(*) as n, MAX(updated_at) as u')->first();

        return md5(($row->n ?? 0) . '|' . ($row->u ?? ''));
    }

    /**
     * Vektor TF-IDF ternormalisasi untuk setiap buku terbit.
     *
     * @return array<int, array<string, float>>
     */
    public function vectors(): array
    {
        return Cache::remember('reco:tfidf:' . $this->catalogVersion(), now()->addHours(6), function () {
            $docs = [];
            foreach ($this->catalog() as $b) {
                // Judul & kategori diberi bobot lebih besar daripada sinopsis.
                $text = str_repeat(' ' . $b->title, 3) . str_repeat(' ' . ($b->category?->name ?? ''), 2) . ' ' . $b->synopsis;
                $docs[$b->id] = $this->tokenize($text);
            }

            $n = max(1, count($docs));
            $df = [];
            foreach ($docs as $terms) {
                foreach (array_keys(array_count_values($terms)) as $t) {
                    $df[$t] = ($df[$t] ?? 0) + 1;
                }
            }

            $vectors = [];
            foreach ($docs as $id => $terms) {
                $tf = array_count_values($terms);
                $vec = [];
                foreach ($tf as $t => $count) {
                    $vec[$t] = (1 + log($count)) * log(($n + 1) / ($df[$t] + 1) + 1);
                }
                $vectors[$id] = $this->normalize($vec);
            }

            return $vectors;
        });
    }

    /** @return array<int, string> */
    private function tokenize(string $text): array
    {
        $text = Str::lower(Str::ascii($text));
        // Pertahankan istilah teknis seperti c++, c#, ui/ux.
        $text = str_replace(['c++', 'c#', 'ui/ux'], [' cpp ', ' csharp ', ' uiux '], $text);
        preg_match_all('/[a-z0-9]+/', $text, $m);

        return array_values(array_filter($m[0], fn ($w) => strlen($w) > 1 && !in_array($w, self::STOPWORDS, true) && !ctype_digit($w)));
    }

    /** @param array<string, float> $v */
    private function normalize(array $v): array
    {
        $norm = sqrt(array_sum(array_map(fn ($x) => $x * $x, $v)));

        return $norm > 0 ? array_map(fn ($x) => $x / $norm, $v) : $v;
    }

    /** Cosine similarity dua vektor yang sudah ternormalisasi. */
    private function cosine(array $a, array $b): float
    {
        if (count($a) > count($b)) {
            [$a, $b] = [$b, $a];
        }
        $dot = 0.0;
        foreach ($a as $t => $x) {
            if (isset($b[$t])) {
                $dot += $x * $b[$t];
            }
        }

        return $dot;
    }

    /**
     * Berapa pembaca yang memiliki $bookId sekaligus buku lain.
     *
     * @return array<int, int>
     */
    private function coOwnership(int $bookId): array
    {
        return Cache::remember("reco:co:{$bookId}", now()->addMinutes(15), fn () => DB::table('user_library as a')
            ->join('user_library as b', function ($j) {
                $j->on('a.user_id', '=', 'b.user_id')->whereColumn('a.book_id', '!=', 'b.book_id');
            })
            ->where('a.book_id', $bookId)
            ->where('a.access_status', 'active')
            ->where('b.access_status', 'active')
            ->groupBy('b.book_id')
            ->selectRaw('b.book_id as id, COUNT(*) as n')
            ->pluck('n', 'id')
            ->map(fn ($n) => (int) $n)
            ->all());
    }

    /**
     * Skor tren 0..1 dengan peluruhan eksponensial.
     * Pembelian terkonfirmasi bernilai 5×, kunjungan halaman 1×, dalam 30 hari terakhir.
     *
     * @return array<int, float>
     */
    public function trendingScores(): array
    {
        return Cache::remember('reco:trending', now()->addMinutes(10), function () {
            $since = now()->subDays(30);
            $raw = [];

            $sales = DB::table('order_items')
                ->join('orders', 'orders.id', '=', 'order_items.order_id')
                ->where('orders.status', 'dikonfirmasi')
                ->where('orders.updated_at', '>=', $since)
                ->selectRaw('order_items.book_id as id, DATE(orders.updated_at) as d, COUNT(*) as n')
                ->groupBy('order_items.book_id', 'd')
                ->get();
            $views = DB::table('book_views')
                ->where('created_at', '>=', $since)
                ->selectRaw('book_id as id, DATE(created_at) as d, COUNT(*) as n')
                ->groupBy('book_id', 'd')
                ->get();

            $tau = 7.0; // waktu paruh ≈ 7 × ln2 ≈ 5 hari
            foreach ([[$sales, 5.0], [$views, 1.0]] as [$rows, $weight]) {
                foreach ($rows as $r) {
                    $age = max(0, now()->startOfDay()->diffInDays($r->d, true));
                    $raw[$r->id] = ($raw[$r->id] ?? 0) + $weight * $r->n * exp(-$age / $tau);
                }
            }

            if (!$raw) {
                return [];
            }
            // Skala log agar satu buku viral tidak menenggelamkan yang lain.
            $max = log(1 + max($raw));

            return array_map(fn ($v) => $max > 0 ? log(1 + $v) / $max : 0, $raw);
        });
    }

    /**
     * Kualitas 0..1 dari rating pembaca dengan rata-rata Bayesian: buku dengan sedikit
     * ulasan ditarik ke rata-rata 3,5 sehingga satu ulasan bintang 5 tidak langsung unggul.
     */
    private function quality(Book $b): float
    {
        $n = (int) $b->rating_count;
        if ($n === 0) {
            return 0.5;
        }
        $prior = 3.5;
        $weight = 5;
        $bayes = ($weight * $prior + $n * (float) $b->rating_avg) / ($weight + $n);

        return max(0.0, min(1.0, ($bayes - 1) / 4));
    }

    /**
     * Maximal Marginal Relevance: ambil kandidat dengan skor tinggi, tapi hukum yang
     * terlalu mirip dengan yang sudah terpilih (λ = 0.75).
     */
    private function diversify(Collection $scored, int $limit, array $vectors): Collection
    {
        $pool = $scored->sortByDesc('score')->values()->all();
        $picked = [];
        $lambda = 0.75;

        while ($pool && count($picked) < $limit) {
            $bestIdx = 0;
            $bestVal = -INF;
            foreach ($pool as $i => $cand) {
                $maxSim = 0.0;
                foreach ($picked as $p) {
                    $sim = $this->cosine($vectors[$cand['book']->id] ?? [], $vectors[$p['book']->id] ?? []);
                    if ($p['book']->category_id === $cand['book']->category_id) {
                        $sim = max($sim, 0.35);
                    }
                    $maxSim = max($maxSim, $sim);
                }
                $val = $lambda * $cand['score'] - (1 - $lambda) * $maxSim;
                if ($val > $bestVal) {
                    $bestVal = $val;
                    $bestIdx = $i;
                }
            }
            $picked[] = $pool[$bestIdx];
            array_splice($pool, $bestIdx, 1);
        }

        return collect($picked);
    }

    /** Kalimat alasan yang paling menjelaskan kenapa buku ini direkomendasikan. */
    private function explain(Book $b, float $content, float $cat, float $trend, array $weights, array $vectors, Collection $byId, array $preferred): string
    {
        // Cari buku riwayat pembaca yang paling mirip → "Karena Anda melihat X".
        $anchor = null;
        $anchorSim = 0.0;
        foreach ($weights as $id => $w) {
            if ($id === $b->id) {
                continue;
            }
            $sim = $this->cosine($vectors[$id] ?? [], $vectors[$b->id] ?? []) * min(1.5, $w);
            if ($sim > $anchorSim) {
                $anchorSim = $sim;
                $anchor = $byId[$id] ?? null;
            }
        }

        if ($anchor && $content >= 0.12 && $anchorSim >= 0.12) {
            return 'Karena Anda tertarik “' . Str::limit(Str::before($anchor->title, ':'), 32) . '”';
        }
        if ($b->category_id && in_array($b->category_id, $preferred, true)) {
            return 'Sesuai topik favorit Anda: ' . $b->category?->name;
        }
        if ($cat >= 0.5 && $b->category) {
            return 'Karena Anda menjelajahi ' . $b->category->name;
        }
        if ($trend >= 0.4) {
            return 'Sedang populer';
        }

        return 'Mungkin Anda suka';
    }
}
