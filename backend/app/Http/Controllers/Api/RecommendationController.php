<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\Category;
use App\Services\Recommender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Auth;

class RecommendationController extends Controller
{
    public function __construct(private readonly Recommender $recommender) {}

    /** Rekomendasi personal. Tamu cukup mengirim ?seen=ID,ID (riwayat lihat di perangkatnya). */
    public function forYou(Request $request): JsonResponse
    {
        $user = Auth::guard('sanctum')->user();
        $seen = array_filter(array_map('intval', explode(',', (string) $request->query('seen', ''))));
        $limit = min(max((int) $request->query('limit', 8), 1), 24);

        $prefs = array_filter(array_map('intval', explode(',', (string) $request->query('prefs', ''))));

        $result = $this->recommender->forReader($user, $seen, $limit, $prefs);

        return response()->json([
            'personalized' => $result['personalized'],
            'data' => $this->present($result['items']),
        ]);
    }

    public function similar(string $slug): JsonResponse
    {
        $book = Book::where('slug', $slug)->where('status', 'published')->firstOrFail();

        return response()->json(['data' => $this->present($this->recommender->similar($book, 6))]);
    }

    public function trending(Request $request): JsonResponse
    {
        $limit = min(max((int) $request->query('limit', 8), 1), 24);

        return response()->json(['data' => $this->present($this->recommender->trending($limit))]);
    }

    /** Dipanggil browser saat halaman buku dibuka (bukan oleh render server yang di-cache). */
    public function recordView(Request $request, string $slug): JsonResponse
    {
        $book = Book::where('slug', $slug)->where('status', 'published')->firstOrFail();
        $this->recommender->recordView($book, Auth::guard('sanctum')->user(), $request->ip() . '|' . $request->userAgent());

        return response()->json(['ok' => true]);
    }

    public function preferences(Request $request): JsonResponse
    {
        return response()->json([
            'category_ids' => array_map('intval', (array) ($request->user()->preferred_categories ?? [])),
        ]);
    }

    public function updatePreferences(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category_ids' => 'present|array|max:12',
            'category_ids.*' => 'integer|exists:categories,id',
        ]);

        $ids = array_values(array_unique(array_map('intval', $data['category_ids'])));
        $request->user()->update(['preferred_categories' => $ids]);

        return response()->json([
            'message' => $ids ? 'Topik favorit disimpan. Rekomendasi Anda sudah diperbarui.' : 'Topik favorit dikosongkan.',
            'category_ids' => $ids,
            'categories' => Category::whereIn('id', $ids)->get(['id', 'name', 'slug']),
        ]);
    }

    /** @param Collection<int, array{book: Book, score: float, reason: string}> $items */
    private function present(Collection $items): array
    {
        return $items->map(fn (array $i) => [
            ...$i['book']->toArray(),
            'reason' => $i['reason'],
            'score' => round($i['score'], 4),
        ])->values()->all();
    }
}
