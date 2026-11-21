<?php

namespace App\Services\Assistant;

use App\Models\Book;
use App\Models\Bundle;
use App\Models\Category;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\User;
use App\Models\UserLibrary;
use App\Models\Wishlist;
use App\Services\BookSearch;
use App\Services\CatalogSearch;
use App\Services\Recommender;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Str;

/**
 * Alat yang boleh dipakai Kanca. Semuanya hanya-baca.
 *  - Alat katalog: data publik (buku terbit, kategori, promo publik, lokasi topik di dalam buku).
 *  - Alat pribadi (pesanan, perpustakaan, wishlist, rekomendasi): HANYA ditawarkan ke model bila
 *    pengguna login, dan hanya membaca data milik pengguna itu sendiri (dicek ulang di run()).
 */
class AssistantTools
{
    /** Buku yang muncul di hasil alat, untuk kartu buku di bawah jawaban. @var array<string, array> */
    private array $seen = [];

    /** Pengguna yang sedang bertanya (null = tamu). */
    private ?User $user = null;

    /** Kata kunci pencarian katalog yang tidak menemukan buku (untuk laporan admin). @var list<string> */
    private array $missing = [];

    /** Nama alat yang dipakai selama satu jawaban. @var list<string> */
    private array $used = [];

    public const PERSONAL_TOOLS = ['get_my_orders', 'get_my_library', 'recommend_for_me'];

    public function forUser(?User $user): static
    {
        $this->user = $user;

        return $this;
    }

    /** @return list<string> */
    public function missingQueries(): array
    {
        return array_values(array_unique($this->missing));
    }

    /** @return list<string> */
    public function usedTools(): array
    {
        return array_values(array_unique($this->used));
    }

    /** Definisi alat dalam format function calling OpenAI-compatible (Gemini, Groq, OpenRouter, dll). */
    public static function definitions(bool $personal = false): array
    {
        $fn = fn (string $name, string $description, ?array $params = null) => [
            'type' => 'function',
            'function' => array_filter(['name' => $name, 'description' => $description, 'parameters' => $params]),
        ];

        return [
            $fn(
                'search_books',
                'Cari buku di katalog Srawung (hanya buku yang sudah terbit). Pakai untuk rekomendasi, mencari judul/penulis/topik, '
                    . 'menyaring kategori atau harga, dan buku yang sedang promo. Kembalikan maksimal 8 buku beserta harga saat ini dan tautannya.',
                [
                    'type' => 'object',
                    'properties' => [
                        'query' => ['type' => 'string', 'description' => 'Kata kunci judul, penulis, atau topik (singkat, mis. "python" atau "cpns"). Kosongkan untuk menelusuri berdasarkan filter saja.'],
                        'category' => ['type' => 'string', 'description' => 'Slug kategori dari list_categories, mis. "pemrograman".'],
                        'max_price' => ['type' => 'integer', 'description' => 'Harga maksimal dalam rupiah.'],
                        'on_sale_only' => ['type' => 'boolean', 'description' => 'true = hanya buku yang sedang diskon.'],
                        'sort' => ['type' => 'string', 'enum' => ['relevan', 'terbaru', 'terlaris', 'termurah', 'rating'], 'description' => 'Urutan hasil.'],
                    ],
                ],
            ),
            $fn(
                'get_book_details',
                'Detail satu buku: sinopsis, jumlah halaman, halaman pratinjau gratis, harga & masa promo, kategori, penulis, rating, '
                    . 'dan paket hemat yang memuatnya. Pakai sebelum menjelaskan isi buku.',
                [
                    'type' => 'object',
                    'properties' => ['slug' => ['type' => 'string', 'description' => 'Slug buku dari hasil search_books.']],
                    'required' => ['slug'],
                ],
            ),
            // Alat tanpa parameter: "parameters" dihilangkan (beberapa penyedia menolak objek properti kosong).
            $fn('list_categories', 'Daftar kategori buku beserta slug dan jumlah judul yang tersedia.'),
            $fn('get_promotions', 'Promo yang sedang berlaku: kupon publik (kode, besar diskon, masa berlaku), buku diskon, dan paket hemat.'),
            $fn(
                'search_inside_books',
                'Cari topik/istilah di DALAM isi semua buku (teks halaman). Pakai untuk pertanyaan "buku mana yang membahas X?" atau '
                    . '"di halaman berapa dibahas X?". Mengembalikan judul buku, nomor halaman, dan nama bab. Cuplikan teks hanya ada untuk halaman pratinjau gratis.',
                [
                    'type' => 'object',
                    'properties' => ['query' => ['type' => 'string', 'description' => 'Istilah atau topik yang dicari, mis. "eloquent relationship".']],
                    'required' => ['query'],
                ],
            ),
            ...($personal ? [
                $fn(
                    'get_my_orders',
                    'Pesanan milik pengguna yang sedang bertanya: status, total, buku, batas waktu bayar, alasan penolakan bukti, dan langkah berikutnya. '
                        . 'Pakai untuk pertanyaan seperti "pesanan saya sudah dikonfirmasi?" atau "kenapa pembayaran saya ditolak?".',
                    [
                        'type' => 'object',
                        'properties' => ['order_number' => ['type' => 'string', 'description' => 'Nomor pesanan tertentu (opsional), mis. AMN-XXXX-2026….']],
                    ],
                ),
                $fn('get_my_library', 'Perpustakaan pengguna (buku dimiliki + progres baca + terakhir dibaca) dan wishlist-nya (harga & promo saat ini).'),
                $fn('recommend_for_me', 'Rekomendasi buku yang dipersonalisasi dari buku yang dimiliki, progres baca, dan riwayat lihat pengguna. Buku yang sudah dimiliki tidak disarankan.'),
            ] : []),
        ];
    }

    /** Jalankan alat; hasil berupa array yang akan di-JSON-kan untuk model. */
    public function run(string $name, array $input): array
    {
        $this->used[] = $name;
        if (in_array($name, self::PERSONAL_TOOLS, true) && !$this->user) {
            return ['error' => 'Pengguna belum masuk. Minta pengguna masuk (login) dulu untuk melihat data akunnya.'];
        }

        return match ($name) {
            'search_books' => $this->searchBooks($input),
            'get_book_details' => $this->bookDetails((string) ($input['slug'] ?? '')),
            'list_categories' => $this->categories(),
            'get_promotions' => $this->promotions(),
            'search_inside_books' => $this->insideBooks((string) ($input['query'] ?? '')),
            'get_my_orders' => $this->myOrders(isset($input['order_number']) ? (string) $input['order_number'] : null),
            'get_my_library' => $this->myLibrary(),
            'recommend_for_me' => $this->recommendForMe(),
            default => ['error' => "Alat {$name} tidak dikenal."],
        };
    }

    /** @return array<string, array> slug => ringkasan buku yang pernah muncul */
    public function seenBooks(): array
    {
        return $this->seen;
    }

    private function published(): Builder
    {
        return Book::query()->with('category:id,name,slug')->where('status', 'published');
    }

    private function searchBooks(array $in): array
    {
        $q = $this->published();
        $query = trim((string) ($in['query'] ?? ''));

        // Relevansi BM25F + koreksi salah ketik (sama dengan pencarian katalog).
        $ranked = $query !== '' ? app(CatalogSearch::class)->search($query) : null;
        if ($query !== '' && $ranked !== null) {
            $q->whereIn('books.id', array_keys($ranked['scores']) ?: [0]);
        } elseif ($query !== '') {
            $q->where(fn (Builder $w) => $w->where('title', 'like', "%{$query}%")->orWhere('author', 'like', "%{$query}%"));
        }
        if (!empty($in['category'])) {
            $q->whereHas('category', fn ($c) => $c->where('slug', $in['category']));
        }
        [$priceSql, $bindings] = Book::effectivePriceSql();
        if (!empty($in['max_price'])) {
            $q->whereRaw("{$priceSql} <= ?", [...$bindings, (int) $in['max_price']]);
        }
        if (!empty($in['on_sale_only'])) {
            $q->onSale();
        }

        match ($in['sort'] ?? 'relevan') {
            'terlaris' => $q->withCount('orderItems')->orderByDesc('order_items_count'),
            'termurah' => $q->orderByRaw($priceSql, $bindings),
            'rating' => $q->orderByDesc('rating_avg'),
            'terbaru' => $q->latest(),
            default => $ranked ? null : $q->latest(),
        };

        $books = $q->limit(30)->get();
        if ($ranked && in_array($in['sort'] ?? 'relevan', ['relevan', null], true)) {
            $order = array_flip(array_keys($ranked['scores']));
            $books = $books->sortBy(fn ($b) => $order[$b->id] ?? PHP_INT_MAX)->values();
        }
        $books = $books->take(8);
        if ($query !== '' && $books->isEmpty()) {
            $this->missing[] = mb_substr(mb_strtolower($query), 0, 80);
        }

        return [
            'total_ditemukan' => $books->count(),
            'koreksi_ejaan' => $ranked['corrected'] ?? null,
            'buku' => $books->map(fn (Book $b) => $this->summary($b))->all(),
            'catatan' => $books->isEmpty() ? 'Tidak ada buku yang cocok. Sarankan kata kunci lain atau tawarkan kategori dari list_categories.' : null,
        ];
    }

    private function bookDetails(string $slug): array
    {
        $book = $this->published()->with(['creator.creatorProfile'])->where('slug', $slug)->first();
        if (!$book) {
            return ['error' => 'Buku tidak ditemukan atau belum terbit. Gunakan search_books untuk mencari slug yang benar.'];
        }

        $bundles = Bundle::available()->whereHas('books', fn ($b) => $b->whereKey($book->id))->get()
            ->map(fn (Bundle $bd) => collect($bd->toStorefront())->only(['title', 'slug', 'price', 'savings', 'book_count'])
                ->put('url', "/paket/{$bd->slug}")->all())
            ->all();

        return $this->summary($book) + [
            'sinopsis' => Str::limit(trim(strip_tags((string) $book->synopsis)), 1500),
            'halaman_pratinjau_gratis' => min((int) ($book->preview_pages ?: 5), (int) ($book->total_pages ?: PHP_INT_MAX)),
            'kreator' => $book->creator?->creatorProfile?->display_name,
            'paket_hemat' => $bundles,
        ];
    }

    private function categories(): array
    {
        return [
            'kategori' => Category::withCount(['books' => fn ($q) => $q->where('status', 'published')])
                ->orderBy('name')->get()
                ->filter(fn ($c) => $c->books_count > 0)
                ->map(fn ($c) => ['nama' => $c->name, 'slug' => $c->slug, 'jumlah_judul' => $c->books_count, 'url' => "/buku?category={$c->slug}"])
                ->values()->all(),
        ];
    }

    private function promotions(): array
    {
        $coupons = Coupon::where('is_public', true)
            ->whereNull('creator_id')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->where(fn ($q) => $q->whereNull('quota')->orWhereColumn('used_count', '<', 'quota'))
            ->orderBy('expires_at')->get()
            ->map(fn (Coupon $c) => [
                'kode' => $c->code,
                'diskon' => $c->type === 'percent' ? "{$c->value}%" : 'Rp ' . number_format((int) $c->value, 0, ',', '.'),
                'keterangan' => $c->description,
                'berlaku_sampai' => $c->expires_at?->translatedFormat('j F Y'),
                'sisa_hari' => $c->expires_at ? max(0, (int) ceil(now()->diffInHours($c->expires_at) / 24)) : null,
            ])->all();

        $sale = $this->published()->onSale()->orderBy('sale_ends_at')->limit(8)->get()->map(fn (Book $b) => $this->summary($b))->all();

        $bundles = Bundle::available()->with('books')->latest()->limit(5)->get()
            ->map(fn (Bundle $bd) => collect($bd->toStorefront())->only(['title', 'price', 'individual_total', 'savings', 'savings_percent', 'book_count'])
                ->put('url', "/paket/{$bd->slug}")->all())
            ->all();

        return [
            'kupon_publik' => $coupons,
            'buku_diskon' => $sale,
            'paket_hemat' => $bundles,
            'cara_pakai_kupon' => 'Masukkan kode di halaman Keranjang sebelum checkout.',
        ];
    }

    /** Lokasi topik di dalam isi buku: judul, halaman, bab. Isi halaman berbayar tidak dibocorkan. */
    private function insideBooks(string $query): array
    {
        $query = trim($query);
        if (mb_strlen($query) < 2) {
            return ['error' => 'Kata kunci terlalu pendek.'];
        }
        $result = app(BookSearch::class)->search($query, 5);
        $owned = $this->user
            ? UserLibrary::where('user_id', $this->user->id)->where('access_status', 'active')->pluck('book_id')->flip()->all()
            : [];
        $tocs = Book::whereIn('id', array_column($result['books'], 'id'))->get(['id', 'toc'])->pluck('toc', 'id');

        $books = array_map(function (array $b) use ($owned, $tocs) {
            $isOwned = isset($owned[$b['id']]);
            $pages = array_map(fn ($p) => [
                'halaman' => $p['page'],
                'bab' => self::chapterFor((array) ($tocs[$b['id']] ?? []), (int) $p['page']),
                'gratis' => (bool) $p['free'],
                // Cuplikan hanya untuk halaman pratinjau gratis / buku milik pengguna.
                'cuplikan' => $p['free'] || $isOwned ? Str::limit(strip_tags((string) $p['snippet']), 160) : null,
                'url' => $isOwned ? "/baca/{$b['slug']}?halaman={$p['page']}" : ($p['free'] ? "/buku/{$b['slug']}?halaman={$p['page']}" : "/buku/{$b['slug']}"),
            ], $b['pages']);

            return [
                'judul' => $b['title'],
                'url' => "/buku/{$b['slug']}",
                'dimiliki_pengguna' => $isOwned,
                'jumlah_halaman_cocok' => $b['hits'],
                'halaman' => $pages,
            ];
        }, $result['books']);

        foreach (Book::with('category:id,name,slug')->whereIn('id', array_column($result['books'], 'id'))->get() as $book) {
            $this->summary($book); // daftarkan untuk kartu buku
        }

        return [
            'kata_dicari' => $result['corrected'] ?? $query,
            'total_buku' => $result['total_books'],
            'buku' => $books,
            'catatan' => $books ? 'Sebutkan judul & nomor halaman/babnya; jangan mengutip isi halaman berbayar.' : 'Topik ini tidak ditemukan di isi buku mana pun.',
        ];
    }

    /** Nama bab untuk sebuah halaman dari daftar isi buku ({title, page, level}). */
    private static function chapterFor(array $toc, int $page): ?string
    {
        $best = null;
        foreach ($toc as $entry) {
            $p = (int) ($entry['page'] ?? 0);
            if ($p > 0 && $p <= $page && (int) ($entry['level'] ?? 1) <= 1 && ($best === null || $p >= $best['page'])) {
                $best = ['page' => $p, 'title' => (string) ($entry['title'] ?? '')];
            }
        }

        return $best['title'] ?? null;
    }

    /** Pesanan milik pengguna + langkah berikutnya yang jelas. */
    private function myOrders(?string $number): array
    {
        $q = Order::with(['orderItems.book:id,title', 'orderItems.bundle:id,title', 'paymentProofs'])
            ->where('user_id', $this->user->id)->latest();
        if ($number) {
            $q->where('order_number', trim($number));
        }
        $orders = $q->limit($number ? 1 : 5)->get();
        if ($orders->isEmpty()) {
            return ['pesanan' => [], 'catatan' => $number ? "Pesanan {$number} tidak ditemukan di akun ini." : 'Pengguna belum punya pesanan.'];
        }

        $rp = fn ($v) => 'Rp ' . number_format((int) $v, 0, ',', '.');
        $wib = fn ($d) => $d ? $d->copy()->timezone('Asia/Jakarta')->locale('id')->translatedFormat('j F Y, H:i') . ' WIB' : null;

        return ['pesanan' => $orders->map(function (Order $o) use ($rp, $wib) {
            $proof = $o->paymentProofs->sortByDesc('id')->first();
            $status = [
                'menunggu_pembayaran' => 'Menunggu pembayaran',
                'menunggu_verifikasi' => 'Menunggu verifikasi admin',
                'dikonfirmasi' => 'Dikonfirmasi',
                'ditolak' => 'Bukti pembayaran ditolak',
                'kedaluwarsa' => 'Kedaluwarsa',
                'dikembalikan' => 'Dana dikembalikan',
            ][$o->status] ?? $o->status;
            $pay = "/pesanan/{$o->order_number}/bayar";
            $next = match ($o->status) {
                'menunggu_pembayaran' => "Bayar dengan QRIS sejumlah {$rp($o->total)} lalu unggah bukti di [halaman pembayaran]({$pay}) sebelum " . $wib($o->payment_deadline) . '.',
                'menunggu_verifikasi' => 'Bukti sudah diterima ' . $wib($proof?->created_at) . '. Admin memverifikasi maksimal 1×24 jam pada hari kerja; buku otomatis masuk Perpustakaan setelah dikonfirmasi.',
                'ditolak' => "Unggah ulang bukti yang benar di [halaman pembayaran]({$pay}) sebelum " . $wib($o->payment_deadline) . '. Alasan penolakan: ' . ($proof?->rejection_reason ?: '-'),
                'dikonfirmasi' => 'Selesai — bukunya sudah ada di [Perpustakaan](/perpustakaan).',
                'kedaluwarsa' => 'Batas waktu bayar terlewat. Buat pesanan baru dari katalog; bila sudah terlanjur membayar, hubungi admin via WhatsApp dengan nomor pesanan ini.',
                'dikembalikan' => 'Dana dikembalikan' . ($o->refund_reason ? " ({$o->refund_reason})" : '') . '.',
                default => null,
            };

            return [
                'nomor' => $o->order_number,
                'dibuat' => $wib($o->created_at),
                'status' => $status,
                'total' => $rp($o->total),
                'buku' => $o->orderItems->map(fn ($i) => $i->bundle?->title ? "Paket {$i->bundle->title}" : ($i->book?->title ?? 'Buku'))->unique()->values()->all(),
                'langkah_berikutnya' => $next,
                'url' => $pay,
            ];
        })->all()];
    }

    /** Buku milik pengguna (progres baca) + wishlist. */
    private function myLibrary(): array
    {
        $library = UserLibrary::with('book:id,title,slug,total_pages,status')
            ->where('user_id', $this->user->id)->where('access_status', 'active')
            ->orderByDesc('last_read_at')->orderByDesc('updated_at')->limit(15)->get()
            ->filter(fn ($l) => $l->book)
            ->map(function ($l) {
                $total = max(1, (int) $l->book->total_pages);
                $page = max(1, (int) $l->last_read_page);

                return [
                    'judul' => $l->book->title,
                    'progres' => $page <= 1 ? 'belum mulai dibaca' : min(100, (int) floor($page / $total * 100)) . "% (halaman {$page} dari {$total})",
                    'terakhir_dibaca' => $l->last_read_at?->copy()->timezone('Asia/Jakarta')->locale('id')->diffForHumans(),
                    'url_baca' => "/baca/{$l->book->slug}",
                ];
            })->values()->all();

        $wishlist = Wishlist::with('book.category:id,name,slug')->where('user_id', $this->user->id)->latest()->limit(10)->get()
            ->filter(fn ($w) => $w->book && $w->book->status === 'published')
            ->map(fn ($w) => $this->summary($w->book))->values()->all();

        return [
            'perpustakaan' => $library,
            'wishlist' => $wishlist,
            'catatan' => $library ? 'Tautkan buku yang dimiliki memakai url_baca.' : 'Pengguna belum memiliki buku.',
        ];
    }

    private function recommendForMe(): array
    {
        $rec = app(Recommender::class)->forReader($this->user, [], 5);

        return [
            'dipersonalisasi' => $rec['personalized'],
            'buku' => $rec['items']->map(fn ($i) => $this->summary($i['book']) + ['alasan' => $i['reason']])->values()->all(),
        ];
    }

    private function summary(Book $b): array
    {
        $current = $b->currentPrice();
        $onSale = $current < (int) $b->price;
        $row = [
            'judul' => $b->title,
            'slug' => $b->slug,
            'penulis' => $b->author,
            'kategori' => $b->category?->name,
            'harga' => 'Rp ' . number_format($current, 0, ',', '.'),
            'harga_normal' => $onSale ? 'Rp ' . number_format((int) $b->price, 0, ',', '.') : null,
            'promo_berakhir' => $onSale && $b->sale_ends_at ? $b->sale_ends_at->translatedFormat('j F Y H:i') . ' WIB' : null,
            'jumlah_halaman' => $b->total_pages ?: null,
            'rating' => $b->rating_count ? round((float) $b->rating_avg, 1) . ' dari 5 (' . $b->rating_count . ' ulasan)' : 'belum ada ulasan',
            'url' => "/buku/{$b->slug}",
        ];

        $this->seen[$b->slug] = [
            'title' => $b->title,
            'slug' => $b->slug,
            'author' => $b->author,
            'cover_url' => $b->cover_url,
            'price' => (int) $b->price,
            'effective_price' => $current,
        ];

        return $row;
    }
}
