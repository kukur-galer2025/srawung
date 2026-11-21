<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Review;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Moderasi ulasan pembeli. */
class ReviewController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $reviews = Review::with(['user:id,name,email', 'book:id,title,slug'])
            ->when($request->query('status') === 'hidden', fn ($q) => $q->where('is_hidden', true))
            ->when($request->query('status') === 'visible', fn ($q) => $q->where('is_hidden', false))
            ->when($request->filled('rating'), fn ($q) => $q->where('rating', (int) $request->rating))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = "%{$request->search}%";
                $q->where(fn ($w) => $w->where('title', 'like', $term)->orWhere('body', 'like', $term)
                    ->orWhereHas('book', fn ($b) => $b->where('title', 'like', $term)));
            })
            ->latest()
            ->paginate(15);

        return response()->json($reviews);
    }

    public function hide(Request $request, Review $review): JsonResponse
    {
        $data = $request->validate(['reason' => 'nullable|string|max:200']);
        $review->update(['is_hidden' => true, 'hidden_reason' => $data['reason'] ?? null]);
        $review->book?->refreshRating();

        return response()->json(['message' => 'Ulasan disembunyikan dari publik.']);
    }

    public function unhide(Review $review): JsonResponse
    {
        $review->update(['is_hidden' => false, 'hidden_reason' => null]);
        $review->book?->refreshRating();

        return response()->json(['message' => 'Ulasan ditampilkan kembali.']);
    }

    public function destroy(Review $review): JsonResponse
    {
        $book = $review->book;
        $review->delete();
        $book?->refreshRating();

        return response()->json(['message' => 'Ulasan dihapus.']);
    }
}
