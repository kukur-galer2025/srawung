<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Services\CartPricing;
use Illuminate\Http\Request;

/**
 * Keranjang utama ada di peramban (localStorage). Endpoint ini:
 *  - PUT  /cart        menyimpan salinannya di server (pengingat keranjang & pindah perangkat)
 *  - GET  /cart        mengambil salinan server (dipakai saat login di perangkat baru)
 *  - POST /cart/quote  menghitung harga final (promo, paket, buku yang sudah dimiliki)
 */
class CartController extends Controller
{
    public function show(Request $request, CartPricing $pricing)
    {
        $cart = Cart::firstWhere('user_id', $request->user()->id);
        if (!$cart || $cart->isEmpty()) {
            return response()->json(['lines' => [], 'subtotal' => 0]);
        }

        $quote = $pricing->quote($request->user(), $cart->book_ids ?? [], $cart->bundle_ids ?? []);

        return response()->json(['lines' => $quote['lines'], 'subtotal' => $quote['subtotal']]);
    }

    public function sync(Request $request)
    {
        $data = $request->validate([
            'book_ids' => 'present|array|max:100',
            'book_ids.*' => 'integer',
            'bundle_ids' => 'present|array|max:20',
            'bundle_ids.*' => 'integer',
        ]);

        $books = array_values(array_unique(array_map('intval', $data['book_ids'])));
        $bundles = array_values(array_unique(array_map('intval', $data['bundle_ids'])));

        $cart = Cart::firstOrNew(['user_id' => $request->user()->id]);
        $changed = !$cart->exists
            || $this->sorted($cart->book_ids) !== $this->sorted($books)
            || $this->sorted($cart->bundle_ids) !== $this->sorted($bundles);

        if ($changed) {
            // Isi berubah → hitung ulang jeda pengingat dari awal.
            $cart->fill([
                'book_ids' => $books,
                'bundle_ids' => $bundles,
                'content_updated_at' => now(),
                'reminder_count' => 0,
                'reminded_at' => null,
            ])->save();
        }

        return response()->json(['saved' => true]);
    }

    public function quote(Request $request, CartPricing $pricing)
    {
        $data = $request->validate([
            'book_ids' => 'nullable|array|max:100',
            'book_ids.*' => 'integer',
            'bundle_ids' => 'nullable|array|max:20',
            'bundle_ids.*' => 'integer',
        ]);

        $quote = $pricing->quote($request->user(), $data['book_ids'] ?? [], $data['bundle_ids'] ?? []);

        return response()->json(['lines' => $quote['lines'], 'subtotal' => $quote['subtotal']]);
    }

    private function sorted(?array $ids): array
    {
        $ids = array_map('intval', $ids ?? []);
        sort($ids);

        return $ids;
    }
}
