<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Banner;
use App\Models\Book;
use App\Models\Coupon;
use Illuminate\Http\JsonResponse;

/**
 * Konten etalase publik: banner iklan beranda dan halaman promo.
 */
class StorefrontController extends Controller
{
    public function banners(): JsonResponse
    {
        return response()->json(
            Banner::live()->limit(8)->get(['id', 'eyebrow', 'title', 'subtitle', 'cta_label', 'link_url', 'image_path', 'theme'])
        );
    }

    public function promo(): JsonResponse
    {
        $books = Book::with('category')
            ->where('status', 'published')
            ->onSale()
            ->orderBy('sale_ends_at')
            ->get()
            ->each->makeHidden(['source_file_path', 'processing_status', 'processing_error']);

        // Hanya kupon yang ditandai publik, masih berlaku, dan kuotanya belum habis.
        $coupons = Coupon::where('is_public', true)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->where(fn ($q) => $q->whereNull('quota')->orWhereColumn('used_count', '<', 'quota'))
            ->orderBy('expires_at')
            ->get()
            ->map(fn (Coupon $c) => [
                'code' => $c->code,
                'type' => $c->type,
                'value' => (int) $c->value,
                'description' => $c->description,
                'expires_at' => $c->expires_at,
                'remaining' => $c->quota === null ? null : max(0, $c->quota - $c->used_count),
            ]);

        return response()->json(['books' => $books, 'coupons' => $coupons]);
    }
}
