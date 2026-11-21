<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Post;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Services\HtmlSanitizer;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class PostController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $posts = Post::with(['author:id,name', 'book:id,title,cover_path'])
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->status))
            ->when($request->filled('search'), fn ($q) => $q->where('title', 'like', "%{$request->search}%"))
            ->latest()
            ->paginate(15);

        return response()->json($posts);
    }

    public function show(Post $post): JsonResponse
    {
        return response()->json($post->load('book:id,title'));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['slug'] = Post::uniqueSlug($data['title']);
        $data['author_id'] = $request->user()->id;
        $data['cover_path'] = $request->hasFile('cover') ? $request->file('cover')->store('posts', 'public') : null;
        $data = $this->stampPublishedAt($data);

        $post = Post::create($data);

        return response()->json(['message' => 'Artikel berhasil dibuat.', 'post' => $post], 201);
    }

    public function update(Request $request, Post $post): JsonResponse
    {
        $data = $this->validated($request);

        if ($data['title'] !== $post->title) {
            $data['slug'] = Post::uniqueSlug($data['title'], $post->id);
        }

        if ($request->hasFile('cover')) {
            $this->deleteCover($post->cover_path);
            $data['cover_path'] = $request->file('cover')->store('posts', 'public');
        } elseif ($request->boolean('remove_cover')) {
            $this->deleteCover($post->cover_path);
            $data['cover_path'] = null;
        }

        $post->update($this->stampPublishedAt($data, $post));

        return response()->json(['message' => 'Artikel berhasil diperbarui.', 'post' => $post->fresh()]);
    }

    /** Markdown/HTML → HTML siap tampil, untuk pratinjau & memuat artikel lama ke editor visual. */
    public function preview(Request $request): JsonResponse
    {
        $request->validate(['body' => 'nullable|string|max:200000', 'format' => 'nullable|in:markdown,html']);
        $post = new Post(['body' => (string) $request->input('body', ''), 'format' => $request->input('format', 'markdown')]);

        return response()->json(['html' => $post->renderBody()]);
    }

    /** Unggah gambar untuk isi artikel. Gambar besar diperkecil & dikonversi ke WebP agar ringan. */
    public function uploadImage(Request $request): JsonResponse
    {
        $request->validate([
            'image' => 'required|image|mimes:jpg,jpeg,png,webp,gif|max:5120',
        ], [
            'image.max' => 'Ukuran gambar maksimal 5 MB.',
            'image.mimes' => 'Format gambar harus JPG, PNG, WebP, atau GIF.',
        ]);

        $file = $request->file('image');
        $dir = 'posts/content/' . now()->format('Y/m');
        $path = null;

        $src = @imagecreatefromstring((string) file_get_contents($file->getRealPath()));
        if ($src !== false && function_exists('imagewebp') && $file->getMimeType() !== 'image/gif') {
            $w = imagesx($src);
            $h = imagesy($src);
            $maxW = 1600;
            if ($w > $maxW) {
                $nh = (int) round($h * $maxW / $w);
                $dst = imagecreatetruecolor($maxW, $nh);
                imagealphablending($dst, false);
                imagesavealpha($dst, true);
                imagecopyresampled($dst, $src, 0, 0, 0, 0, $maxW, $nh, $w, $h);
                imagedestroy($src);
                $src = $dst;
                [$w, $h] = [$maxW, $nh];
            }
            ob_start();
            imagewebp($src, null, 82);
            $data = (string) ob_get_clean();
            imagedestroy($src);
            $path = $dir . '/' . Str::random(24) . '.webp';
            Storage::disk('public')->put($path, $data);
        }

        // GIF (animasi) atau GD tanpa WebP: simpan apa adanya.
        $path ??= $file->store($dir, 'public');

        return response()->json(['url' => Storage::disk('public')->url($path)], 201);
    }

    public function destroy(Post $post): JsonResponse
    {
        $this->deleteCover($post->cover_path);
        $post->delete();

        return response()->json(['message' => 'Artikel dihapus.']);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'title' => 'required|string|max:200',
            'tag' => 'nullable|string|max:40',
            'excerpt' => 'nullable|string|max:400',
            'body' => 'required|string|max:200000',
            'format' => 'nullable|in:markdown,html',
            'book_id' => 'nullable|exists:books,id',
            'status' => 'required|in:draft,published',
            'published_at' => 'nullable|date',
            'cover' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:3072',
        ]);
        unset($data['cover']);

        $data['format'] = $data['format'] ?? 'markdown';
        // HTML dari editor visual disimpan dalam keadaan sudah bersih.
        if ($data['format'] === 'html') {
            $data['body'] = HtmlSanitizer::clean($data['body']);
        }

        return $data;
    }

    /** Saat pertama diterbitkan tanpa tanggal, pakai waktu sekarang. */
    private function stampPublishedAt(array $data, ?Post $post = null): array
    {
        if ($data['status'] === 'published' && empty($data['published_at'])) {
            $data['published_at'] = $post?->published_at ?? now();
        }

        return $data;
    }

    private function deleteCover(?string $path): void
    {
        if ($path && str_starts_with($path, 'posts/')) {
            Storage::disk('public')->delete($path);
        }
    }
}
