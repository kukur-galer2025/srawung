<?php

namespace App\Services;

use App\Models\Book;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Analitik penjualan untuk kreator: alur Dilihat → Masuk keranjang → Checkout → Dibeli
 * per buku, plus saran perbaikan berdasarkan tahap yang paling banyak kehilangan pembeli.
 *
 *  - Dilihat      : kunjungan halaman buku (book_views, dedup 30 menit per pengunjung).
 *  - Keranjang    : pengunjung unik per hari yang menambahkan buku ke keranjang (book_events).
 *  - Checkout     : pesanan yang memuat buku ini (dibayar maupun belum).
 *  - Dibeli       : penjualan terkonfirmasi yang tidak di-refund (creator_earnings).
 */
class CreatorAnalytics
{
    public const PERIODS = [7, 30, 90];

    /** Catat "masuk keranjang" (sekali per pengunjung per buku per hari). */
    public static function recordCart(Book $book, Request $request): void
    {
        $user = $request->user('sanctum');
        $visitor = $user ? 'u:' . $user->id : hash('sha256', $request->ip() . '|' . $request->userAgent() . '|' . config('app.key'));

        DB::table('book_events')->insertOrIgnore([
            'book_id' => $book->id, 'type' => 'cart', 'visitor' => substr($visitor, 0, 64), 'date' => now()->toDateString(),
        ]);
    }

    public function forCreator(int $creatorId, int $days): array
    {
        $days = in_array($days, self::PERIODS, true) ? $days : 30;
        $since = now()->subDays($days - 1)->startOfDay();

        $books = Book::where('creator_id', $creatorId)->orderByDesc('created_at')->get(['id', 'title', 'slug', 'status', 'cover_path', 'price']);
        $ids = $books->pluck('id')->all() ?: [0];

        $views = DB::table('book_views')->whereIn('book_id', $ids)->where('created_at', '>=', $since)
            ->groupBy('book_id')->selectRaw('book_id, COUNT(*) c')->pluck('c', 'book_id');
        $carts = DB::table('book_events')->whereIn('book_id', $ids)->where('type', 'cart')->where('date', '>=', $since->toDateString())
            ->groupBy('book_id')->selectRaw('book_id, COUNT(*) c')->pluck('c', 'book_id');
        $checkouts = DB::table('order_items')->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('order_items.book_id', $ids)->where('orders.created_at', '>=', $since)
            ->groupBy('order_items.book_id')->selectRaw('order_items.book_id, COUNT(DISTINCT orders.id) c')->pluck('c', 'book_id');
        $sales = DB::table('creator_earnings')->whereIn('book_id', $ids)->whereNull('reversed_at')->where('created_at', '>=', $since)
            ->groupBy('book_id')->selectRaw('book_id, COUNT(*) sold, COALESCE(SUM(net),0) net')->get()->keyBy('book_id');

        $rows = $books->map(function (Book $b) use ($views, $carts, $checkouts, $sales) {
            $row = [
                'id' => $b->id, 'title' => $b->title, 'slug' => $b->slug, 'status' => $b->status, 'cover_url' => $b->cover_url,
                'views' => (int) ($views[$b->id] ?? 0),
                'carts' => (int) ($carts[$b->id] ?? 0),
                'checkouts' => (int) ($checkouts[$b->id] ?? 0),
                'sold' => (int) ($sales[$b->id]->sold ?? 0),
                'net' => (int) ($sales[$b->id]->net ?? 0),
            ];
            $row['conversion'] = $row['views'] ? round($row['sold'] / $row['views'] * 100, 1) : null;
            $row['insight'] = self::insight($row);

            return $row;
        })->sortByDesc(fn ($r) => [$r['sold'], $r['views']])->values();

        $total = fn (string $k) => (int) $rows->sum($k);

        return [
            'days' => $days,
            'funnel' => [
                ['key' => 'views', 'label' => 'Dilihat', 'value' => $total('views')],
                ['key' => 'carts', 'label' => 'Masuk keranjang', 'value' => $total('carts')],
                ['key' => 'checkouts', 'label' => 'Checkout', 'value' => $total('checkouts')],
                ['key' => 'sold', 'label' => 'Dibeli', 'value' => $total('sold')],
            ],
            'net' => $total('net'),
            'books' => $rows,
        ];
    }

    /** Satu saran paling relevan untuk tahap yang paling banyak "bocor". */
    private static function insight(array $r): ?array
    {
        if ($r['status'] !== 'published') {
            return null;
        }
        if ($r['views'] < 10) {
            return ['tone' => 'info', 'text' => 'Masih jarang dilihat. Bagikan tautan buku ini di media sosial atau grup komunitas pembaca Anda.'];
        }
        if ($r['carts'] / $r['views'] < 0.03) {
            return ['tone' => 'warning', 'text' => 'Banyak dilihat tapi jarang masuk keranjang. Coba perbaiki sampul, judul, atau sinopsis, dan cek apakah harganya sesuai.'];
        }
        if ($r['carts'] >= 5 && $r['checkouts'] / $r['carts'] < 0.3) {
            return ['tone' => 'warning', 'text' => 'Sering masuk keranjang tapi tidak di-checkout. Voucher atau harga promo terbatas bisa mendorong pembeli memutuskan.'];
        }
        if ($r['checkouts'] >= 3 && $r['sold'] / $r['checkouts'] < 0.5) {
            return ['tone' => 'warning', 'text' => 'Banyak checkout yang tidak dibayar. Pastikan halaman pratinjau gratis cukup meyakinkan pembeli.'];
        }
        if ($r['sold'] > 0) {
            return ['tone' => 'success', 'text' => 'Alur penjualan sehat. Pertahankan, dan pertimbangkan membuat paket hemat dengan buku Anda yang lain.'];
        }

        return null;
    }
}
