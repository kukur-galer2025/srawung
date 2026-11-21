<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\Wishlist;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class WishlistController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = Wishlist::with('book.category')
            ->where('user_id', $request->user()->id)
            ->latest('created_at')
            ->get()
            ->filter(fn (Wishlist $w) => $w->book && $w->book->status === 'published')
            ->map(fn (Wishlist $w) => [
                ...$w->book->makeHidden(['source_file_path', 'processing_status', 'processing_error'])->toArray(),
                'wishlisted_at' => $w->created_at,
            ])
            ->values();

        return response()->json(['data' => $items]);
    }

    /** Daftar ID saja — dipakai tombol hati di kartu buku. */
    public function ids(Request $request): JsonResponse
    {
        return response()->json(Wishlist::where('user_id', $request->user()->id)->pluck('book_id'));
    }

    public function store(Request $request, int $bookId): JsonResponse
    {
        $book = Book::where('status', 'published')->findOrFail($bookId);
        abort_if(Wishlist::where('user_id', $request->user()->id)->count() >= 300, 422, 'Wishlist sudah penuh (maksimal 300 buku).');

        // Bila buku sedang promo saat disimpan, anggap promo ini sudah "diketahui" agar tidak langsung dikirimi email.
        Wishlist::firstOrCreate(
            ['user_id' => $request->user()->id, 'book_id' => $book->id],
            ['notified_sale_key' => $book->saleActive() ? \App\Console\Commands\SendWishlistSaleAlerts::saleKey($book) : null]
        );

        return response()->json(['message' => 'Disimpan ke wishlist. Kami kabari lewat email saat buku ini promo.'], 201);
    }

    public function destroy(Request $request, int $bookId): JsonResponse
    {
        Wishlist::where('user_id', $request->user()->id)->where('book_id', $bookId)->delete();

        return response()->json(['message' => 'Dihapus dari wishlist.']);
    }
}
