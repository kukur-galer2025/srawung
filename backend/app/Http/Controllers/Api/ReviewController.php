<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\Review;
use App\Models\UserLibrary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

/**
 * Ulasan & rating buku. Hanya pembeli (pemilik buku) yang boleh menulis ulasan,
 * satu ulasan per buku per akun (bisa diubah kapan saja).
 */
class ReviewController extends Controller
{
    /** Nama tampilan ringkas demi privasi: "Budi Santoso" → "Budi S." */
    public static function displayName(?string $name): string
    {
        $parts = preg_split('/\s+/', trim((string) $name)) ?: [];
        if (!$parts || $parts[0] === '') {
            return 'Pembaca Srawung';
        }
        $first = Str::limit($parts[0], 20, '');

        return isset($parts[1]) ? $first . ' ' . mb_strtoupper(mb_substr($parts[1], 0, 1)) . '.' : $first;
    }

    public function index(Request $request, string $slug): JsonResponse
    {
        $book = Book::where('slug', $slug)->where('status', 'published')->firstOrFail();
        $viewer = Auth::guard('sanctum')->user();

        $sort = $request->query('sort') === 'rating' ? 'rating' : 'terbaru';
        $reviews = Review::with('user:id,name')
            ->where('book_id', $book->id)
            ->where('is_hidden', false)
            ->when($request->filled('rating'), fn ($q) => $q->where('rating', (int) $request->rating))
            ->when($sort === 'rating', fn ($q) => $q->orderByDesc('rating'))
            ->latest()
            ->paginate(8);

        $distribution = Review::where('book_id', $book->id)->where('is_hidden', false)
            ->selectRaw('rating, COUNT(*) as n')->groupBy('rating')->pluck('n', 'rating');

        return response()->json([
            'summary' => [
                'average' => (float) $book->rating_avg,
                'count' => (int) $book->rating_count,
                'distribution' => collect(range(5, 1))->mapWithKeys(fn ($r) => [$r => (int) ($distribution[$r] ?? 0)]),
            ],
            'data' => $reviews->getCollection()->map(fn (Review $r) => [
                'id' => $r->id,
                'rating' => $r->rating,
                'title' => $r->title,
                'body' => $r->body,
                'author' => self::displayName($r->user?->name),
                'is_mine' => $viewer && $viewer->id === $r->user_id,
                'created_at' => $r->created_at,
                'updated_at' => $r->updated_at,
            ]),
            'current_page' => $reviews->currentPage(),
            'last_page' => $reviews->lastPage(),
            'total' => $reviews->total(),
        ]);
    }

    /** Ulasan milik pengguna + apakah ia boleh mengulas (sudah memiliki buku). */
    public function mine(Request $request, string $slug): JsonResponse
    {
        $book = Book::where('slug', $slug)->firstOrFail();
        $review = Review::where('book_id', $book->id)->where('user_id', $request->user()->id)->first();

        return response()->json([
            'can_review' => $this->owns($request->user()->id, $book->id),
            'review' => $review?->only(['id', 'rating', 'title', 'body', 'is_hidden', 'hidden_reason', 'created_at', 'updated_at']),
        ]);
    }

    public function store(Request $request, string $slug): JsonResponse
    {
        $book = Book::where('slug', $slug)->where('status', 'published')->firstOrFail();
        abort_unless($this->owns($request->user()->id, $book->id), 403, 'Hanya pembeli buku ini yang dapat menulis ulasan.');

        $data = $request->validate([
            'rating' => 'required|integer|min:1|max:5',
            'title' => 'nullable|string|max:120',
            'body' => 'nullable|string|max:2000',
        ], ['rating.required' => 'Pilih jumlah bintang terlebih dahulu.']);

        $data['title'] = isset($data['title']) ? (trim($data['title']) ?: null) : null;
        $data['body'] = isset($data['body']) ? (trim($data['body']) ?: null) : null;

        $review = Review::updateOrCreate(['book_id' => $book->id, 'user_id' => $request->user()->id], $data);
        $book->refreshRating();

        return response()->json([
            'message' => $review->is_hidden
                ? 'Ulasan diperbarui. Ulasan ini sedang disembunyikan admin sehingga belum tampil publik.'
                : ($review->wasRecentlyCreated ? 'Terima kasih! Ulasan Anda sudah tampil.' : 'Ulasan Anda diperbarui.'),
            'review' => $review->only(['id', 'rating', 'title', 'body', 'is_hidden', 'created_at', 'updated_at']),
        ], $review->wasRecentlyCreated ? 201 : 200);
    }

    public function destroy(Request $request, string $slug): JsonResponse
    {
        $book = Book::where('slug', $slug)->firstOrFail();
        Review::where('book_id', $book->id)->where('user_id', $request->user()->id)->firstOrFail()->delete();
        $book->refreshRating();

        return response()->json(['message' => 'Ulasan dihapus.']);
    }

    private function owns(int $userId, int $bookId): bool
    {
        return UserLibrary::where('user_id', $userId)->where('book_id', $bookId)->where('access_status', 'active')->exists();
    }
}
