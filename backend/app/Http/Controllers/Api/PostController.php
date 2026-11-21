<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Post;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PostController extends Controller
{
    private const LIST_COLUMNS = ['id', 'title', 'slug', 'tag', 'excerpt', 'body', 'cover_path', 'book_id', 'author_id', 'published_at', 'views'];

    public function index(Request $request): JsonResponse
    {
        $perPage = min(max((int) $request->query('per_page', 9), 1), 30);

        $posts = Post::published()
            ->with(['author:id,name', 'book:id,cover_path,title'])
            ->when($request->filled('tag'), fn ($q) => $q->where('tag', $request->tag))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = "%{$request->search}%";
                $q->where(fn ($w) => $w->where('title', 'like', $term)->orWhere('excerpt', 'like', $term));
            })
            ->latest('published_at')
            ->paginate($perPage, self::LIST_COLUMNS)
            ->withQueryString();

        // Isi lengkap hanya dikirim di halaman detail.
        $posts->getCollection()->each->makeHidden(['body', 'book']);

        $tags = Post::published()->whereNotNull('tag')->distinct()->orderBy('tag')->pluck('tag');

        return response()->json([...$posts->toArray(), 'tags' => $tags]);
    }

    public function show(string $slug): JsonResponse
    {
        $post = Post::published()->with(['author:id,name', 'book.category'])->where('slug', $slug)->firstOrFail();
        $post->increment('views');

        $related = Post::published()
            ->where('id', '!=', $post->id)
            ->orderByRaw('CASE WHEN tag = ? THEN 0 ELSE 1 END', [$post->tag ?? ''])
            ->latest('published_at')
            ->limit(3)
            ->with('book:id,cover_path,title')
            ->get(self::LIST_COLUMNS)
            ->each->makeHidden(['body', 'book']);

        $book = $post->book && $post->book->status === 'published'
            ? $post->book->makeHidden(['source_file_path', 'processing_status', 'processing_error'])
            : null;

        return response()->json([
            ...$post->makeHidden(['body', 'book'])->toArray(),
            'body_html' => $post->renderBody(),
            'book' => $book,
            'related' => $related,
        ]);
    }
}
