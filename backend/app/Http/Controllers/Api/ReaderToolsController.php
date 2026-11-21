<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\BookPage;
use App\Models\Bookmark;
use App\Models\ReaderNote;
use App\Models\UserLibrary;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

/**
 * Alat baca untuk pemilik buku: daftar isi, pencarian teks, penanda halaman, catatan.
 */
class ReaderToolsController extends Controller
{
    /** Buku yang dimiliki pengguna (akses aktif), atau 403. */
    private function ownedBook(Request $request, string $slug): Book
    {
        $book = Book::where('slug', $slug)->firstOrFail();
        $owns = UserLibrary::where('user_id', $request->user()->id)
            ->where('book_id', $book->id)
            ->where('access_status', 'active')
            ->exists();
        abort_unless($owns, 403, 'Anda tidak memiliki akses ke buku ini.');

        return $book;
    }

    public function toc(Request $request, string $bookSlug): JsonResponse
    {
        $book = $this->ownedBook($request, $bookSlug);

        return response()->json(['toc' => $book->toc ?? [], 'total_pages' => (int) $book->total_pages]);
    }

    /** Cari teks di dalam buku. Mengembalikan halaman + cuplikan singkat di sekitar kata yang dicari. */
    public function search(Request $request, string $bookSlug): JsonResponse
    {
        $book = $this->ownedBook($request, $bookSlug);
        $q = trim((string) $request->validate(['q' => 'required|string|min:2|max:100'])['q']);

        $escaped = addcslashes($q, '%_\\');
        $pages = BookPage::where('book_id', $book->id)
            ->where('text', 'like', "%{$escaped}%")
            ->orderBy('page_number')
            ->limit(60)
            ->get(['page_number', 'text']);

        $results = $pages->map(function (BookPage $p) use ($q) {
            $text = (string) $p->getAttributes()['text'];
            $pos = mb_stripos($text, $q) ?: 0;
            $start = max(0, $pos - 70);
            $snippet = ($start > 0 ? '…' : '') . mb_substr($text, $start, 70 + mb_strlen($q) + 90) . (mb_strlen($text) > $start + 160 + mb_strlen($q) ? '…' : '');

            return [
                'page' => $p->page_number,
                'snippet' => $snippet,
                'matches' => mb_substr_count(mb_strtolower($text), mb_strtolower($q)),
            ];
        });

        return response()->json([
            'query' => $q,
            'total' => $results->count(),
            'truncated' => $results->count() >= 60,
            'results' => $results->values(),
            'indexed' => BookPage::where('book_id', $book->id)->whereNotNull('text')->exists(),
        ]);
    }

    /* ---------------- Penanda halaman ---------------- */

    public function bookmarks(Request $request, string $bookSlug): JsonResponse
    {
        $book = $this->ownedBook($request, $bookSlug);

        return response()->json(Bookmark::where('user_id', $request->user()->id)->where('book_id', $book->id)->orderBy('page_number')->get());
    }

    public function storeBookmark(Request $request, string $bookSlug): JsonResponse
    {
        $book = $this->ownedBook($request, $bookSlug);
        $data = $request->validate([
            'page_number' => 'required|integer|min:1|max:' . max(1, (int) $book->total_pages),
            'label' => 'nullable|string|max:120',
        ]);

        $count = Bookmark::where('user_id', $request->user()->id)->where('book_id', $book->id)->count();
        abort_if($count >= 200, 422, 'Batas 200 penanda per buku tercapai.');

        $bookmark = Bookmark::updateOrCreate(
            ['user_id' => $request->user()->id, 'book_id' => $book->id, 'page_number' => $data['page_number']],
            ['label' => $data['label'] ?? null]
        );

        return response()->json($bookmark, 201);
    }

    public function destroyBookmark(Request $request, string $bookSlug, int $id): JsonResponse
    {
        $book = $this->ownedBook($request, $bookSlug);
        Bookmark::where('id', $id)->where('user_id', $request->user()->id)->where('book_id', $book->id)->firstOrFail()->delete();

        return response()->json(['message' => 'Penanda dihapus.']);
    }

    /* ---------------- Catatan ---------------- */

    public function notes(Request $request, string $bookSlug): JsonResponse
    {
        $book = $this->ownedBook($request, $bookSlug);

        return response()->json(
            ReaderNote::where('user_id', $request->user()->id)->where('book_id', $book->id)
                ->orderBy('page_number')->orderBy('created_at')->get()
        );
    }

    public function storeNote(Request $request, string $bookSlug): JsonResponse
    {
        $book = $this->ownedBook($request, $bookSlug);
        $data = $this->validateNote($request, $book);

        $count = ReaderNote::where('user_id', $request->user()->id)->where('book_id', $book->id)->count();
        abort_if($count >= 1000, 422, 'Batas 1.000 catatan per buku tercapai.');

        $note = ReaderNote::create([...$data, 'user_id' => $request->user()->id, 'book_id' => $book->id]);

        return response()->json($note, 201);
    }

    public function updateNote(Request $request, string $bookSlug, int $id): JsonResponse
    {
        $book = $this->ownedBook($request, $bookSlug);
        $note = ReaderNote::where('id', $id)->where('user_id', $request->user()->id)->where('book_id', $book->id)->firstOrFail();
        $note->update($this->validateNote($request, $book));

        return response()->json($note);
    }

    public function destroyNote(Request $request, string $bookSlug, int $id): JsonResponse
    {
        $book = $this->ownedBook($request, $bookSlug);
        ReaderNote::where('id', $id)->where('user_id', $request->user()->id)->where('book_id', $book->id)->firstOrFail()->delete();

        return response()->json(['message' => 'Catatan dihapus.']);
    }

    private function validateNote(Request $request, Book $book): array
    {
        $data = $request->validate([
            'page_number' => 'required|integer|min:1|max:' . max(1, (int) $book->total_pages),
            'body' => 'required|string|max:2000',
            'color' => ['nullable', Rule::in(ReaderNote::COLORS)],
        ], ['body.required' => 'Isi catatan tidak boleh kosong.']);
        $data['body'] = Str::of($data['body'])->trim()->toString();
        $data['color'] = $data['color'] ?? 'amber';

        return $data;
    }
}
