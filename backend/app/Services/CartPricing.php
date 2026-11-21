<?php

namespace App\Services;

use App\Models\Book;
use App\Models\Bundle;
use App\Models\User;
use App\Models\UserLibrary;

/**
 * Satu-satunya tempat menghitung harga keranjang — dipakai halaman keranjang
 * (POST /cart/quote), checkout (OrderController::store), dan email pengingat
 * keranjang. Dengan begitu angka yang dilihat pembeli = angka yang ditagih.
 *
 * Aturan:
 *  - Buku satuan: harga promo bila berlaku. Buku yang sudah dimiliki ditandai
 *    "owned" dan tidak ikut dihitung.
 *  - Paket: harga paket dibagi ke tiap buku sebanding harga normalnya. Buku paket
 *    yang sudah dimiliki dikeluarkan beserta bagiannya → pembeli tidak membayar
 *    dua kali. Bila semua buku sudah dimiliki, paket tidak tersedia.
 *  - Buku yang muncul dua kali (di paket & satuan, atau di dua paket) hanya
 *    ditagih sekali.
 */
class CartPricing
{
    /**
     * @param  list<int>  $bookIds
     * @param  list<int>  $bundleIds
     * @return array{
     *     lines: list<array<string, mixed>>,
     *     items: list<array{book_id: int, bundle_id: ?int, price: int}>,
     *     subtotal: int,
     *     owned_single_titles: list<string>
     * }
     */
    public function quote(?User $user, array $bookIds, array $bundleIds): array
    {
        $bookIds = array_values(array_unique(array_map('intval', array_filter($bookIds))));
        $bundleIds = array_values(array_unique(array_map('intval', array_filter($bundleIds))));

        $bundles = $bundleIds
            ? Bundle::with('books.category')->whereIn('id', $bundleIds)->get()->sortBy(fn ($b) => array_search($b->id, $bundleIds))
            : collect();
        $books = $bookIds
            ? Book::whereIn('id', $bookIds)->get()->sortBy(fn ($b) => array_search($b->id, $bookIds))
            : collect();

        $allBookIds = $books->pluck('id')->merge($bundles->flatMap(fn ($b) => $b->books->pluck('id')))->unique()->all();
        $owned = ($user && $allBookIds)
            ? UserLibrary::where('user_id', $user->id)->whereIn('book_id', $allBookIds)->where('access_status', 'active')->pluck('book_id')->flip()->all()
            : [];

        $lines = [];
        $items = [];
        $charged = []; // book_id => true (sudah ditagih di baris sebelumnya)
        $ownedSingles = [];

        foreach ($bundles as $bundle) {
            $published = $bundle->books->where('status', 'published')->values();
            $line = [
                'type' => 'bundle',
                'id' => $bundle->id,
                'title' => $bundle->title,
                'slug' => $bundle->slug,
                'author' => $published->count() . ' buku',
                'cover_url' => $published->first()?->cover_url,
                'normal_price' => (int) $published->sum(fn (Book $b) => $b->currentPrice()),
                'price' => 0,
                'available' => false,
                'note' => null,
                'books' => [],
            ];

            if (!$bundle->isAvailable() || $published->isEmpty()) {
                $line['note'] = 'Paket ini sudah tidak tersedia.';
                $lines[] = $line;
                continue;
            }

            $shares = $bundle->allocate($published);
            $skippedOwned = 0;
            $skippedDup = 0;
            foreach ($published as $book) {
                $state = isset($owned[$book->id]) ? 'owned' : (isset($charged[$book->id]) ? 'duplicate' : 'included');
                $line['books'][] = [
                    'id' => $book->id,
                    'title' => $book->title,
                    'slug' => $book->slug,
                    'cover_url' => $book->cover_url,
                    'state' => $state,
                    'price' => $state === 'included' ? $shares[$book->id] : 0,
                ];
                if ($state === 'included') {
                    $charged[$book->id] = true;
                    $line['price'] += $shares[$book->id];
                    $items[] = ['book_id' => $book->id, 'bundle_id' => $bundle->id, 'price' => $shares[$book->id]];
                } elseif ($state === 'owned') {
                    $skippedOwned++;
                } else {
                    $skippedDup++;
                }
            }

            $line['available'] = $line['price'] > 0 || collect($line['books'])->contains('state', 'included');
            if (!$line['available']) {
                $line['note'] = 'Anda sudah memiliki semua buku di paket ini.';
            } elseif ($skippedOwned || $skippedDup) {
                $parts = [];
                if ($skippedOwned) {
                    $parts[] = "{$skippedOwned} buku sudah Anda miliki";
                }
                if ($skippedDup) {
                    $parts[] = "{$skippedDup} buku sudah ada di keranjang";
                }
                $line['note'] = ucfirst(implode(' dan ', $parts)) . ' — harga paket disesuaikan.';
            }
            $lines[] = $line;
        }

        foreach ($books as $book) {
            $line = [
                'type' => 'book',
                'id' => $book->id,
                'title' => $book->title,
                'slug' => $book->slug,
                'author' => $book->author,
                'cover_url' => $book->cover_url,
                'normal_price' => (int) $book->price,
                'price' => $book->currentPrice(),
                'on_sale' => $book->saleActive(),
                'available' => true,
                'note' => null,
            ];

            if ($book->status !== 'published') {
                [$line['available'], $line['note']] = [false, 'Buku ini sudah tidak dijual.'];
            } elseif (isset($owned[$book->id])) {
                [$line['available'], $line['note']] = [false, 'Sudah ada di perpustakaan Anda.'];
                $line['owned'] = true;
                $ownedSingles[] = $book->title;
            } elseif (isset($charged[$book->id])) {
                [$line['available'], $line['note']] = [false, 'Sudah termasuk dalam paket di keranjang.'];
            }

            if ($line['available']) {
                $charged[$book->id] = true;
                $items[] = ['book_id' => $book->id, 'bundle_id' => null, 'price' => $line['price']];
            } else {
                $line['price'] = 0;
            }
            $lines[] = $line;
        }

        return [
            'lines' => $lines,
            'items' => $items,
            'subtotal' => (int) array_sum(array_column($items, 'price')),
            'owned_single_titles' => $ownedSingles,
        ];
    }
}
