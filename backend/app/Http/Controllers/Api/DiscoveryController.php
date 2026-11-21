<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\UserLibrary;
use App\Services\BookSearch;
use App\Services\NextReads;
use App\Services\SmartSearch;
use Illuminate\Http\Request;

class DiscoveryController extends Controller
{
    /**
     * GET /search/suggest?q=&seen=1,2&prefs=3 — saran instan di kotak pencarian, dipersonalisasi.
     * q kosong → pencarian populer, rekomendasi untuk Anda, dan kategori sesuai minat.
     */
    public function suggest(Request $request, SmartSearch $search)
    {
        $data = $request->validate(['q' => 'nullable|string|max:100', 'seen' => 'nullable|string|max:400', 'prefs' => 'nullable|string|max:200']);
        $ids = fn (?string $v, int $max) => array_slice(array_values(array_filter(array_map('intval', explode(',', (string) $v)))), 0, $max);
        $user = $request->user('sanctum');
        $q = trim((string) ($data['q'] ?? ''));

        $result = $q === ''
            ? $search->discover($user, $ids($data['seen'] ?? null, 30), $ids($data['prefs'] ?? null, 12))
            : $search->suggest($q, $user, $ids($data['seen'] ?? null, 30), $ids($data['prefs'] ?? null, 12));

        return response()->json($result)->header('Cache-Control', 'private, no-store');
    }

    /** POST /search/click — buku yang dipilih dari hasil pencarian (umpan balik peringkat). */
    public function searchClick(Request $request)
    {
        $data = $request->validate(['q' => 'required|string|max:100', 'book_id' => 'required|integer']);
        $visitor = $request->user('sanctum')?->id ?? hash('sha256', $request->ip() . '|' . $request->userAgent());
        SmartSearch::recordClick($data['q'], (int) $data['book_id'], (string) $visitor);

        return response()->noContent();
    }

    /** GET /search/inside?q= — cari kata/topik di dalam isi semua buku. */
    public function searchInside(Request $request, BookSearch $search)
    {
        $data = $request->validate(['q' => 'required|string|min:2|max:200'], ['q.min' => 'Ketik minimal 2 huruf.']);
        $started = microtime(true);
        $result = $search->search($data['q'], 12);

        // Tandai buku yang sudah dimiliki → hasil langsung membuka reader di halaman itu.
        if ($user = $request->user('sanctum')) {
            $owned = UserLibrary::where('user_id', $user->id)->where('access_status', 'active')
                ->whereIn('book_id', array_column($result['books'], 'id'))->pluck('book_id')->flip();
            foreach ($result['books'] as &$b) {
                $b['is_owned'] = isset($owned[$b['id']]);
            }
            unset($b);
        }

        return response()->json([...$result, 'took_ms' => (int) round((microtime(true) - $started) * 1000)]);
    }

    /** GET /books/{slug}/next — "Setelah buku ini, pembaca biasanya lanjut ke…" */
    public function next(Request $request, string $slug, NextReads $next)
    {
        $book = Book::where('slug', $slug)->where('status', 'published')->firstOrFail();

        $items = array_map(fn ($i) => [
            ...$i['book']->makeHidden(['source_file_path', 'processing_status', 'processing_error', 'synopsis'])->toArray(),
            'kind' => $i['kind'],
            'reason' => $i['reason'],
            'percent' => $i['percent'],
            'is_owned' => $i['owned'],
        ], $next->for($book, $request->user('sanctum')));

        return response()->json($items);
    }
}
