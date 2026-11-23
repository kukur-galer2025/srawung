<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Banner;
use App\Services\CoverImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

class BannerController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json(Banner::orderBy('sort_order')->orderByDesc('id')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['image_path'] = $this->storeImage($request);

        $banner = Banner::create($data);

        return response()->json(['message' => 'Banner berhasil dibuat.', 'banner' => $banner], 201);
    }

    public function show(Banner $banner): JsonResponse
    {
        return response()->json($banner);
    }

    public function update(Request $request, Banner $banner): JsonResponse
    {
        $data = $this->validated($request);

        if ($request->hasFile('image')) {
            $data['image_path'] = $this->storeImage($request); // simpan baru dulu, baru hapus yang lama
            $this->deleteImage($banner->image_path);
        } elseif ($request->boolean('remove_image')) {
            $this->deleteImage($banner->image_path);
            $data['image_path'] = null;
        }

        $banner->update($data);

        return response()->json(['message' => 'Banner berhasil diperbarui.', 'banner' => $banner->fresh()]);
    }

    public function destroy(Banner $banner): JsonResponse
    {
        $this->deleteImage($banner->image_path);
        $banner->delete();

        return response()->json(['message' => 'Banner dihapus.']);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'eyebrow' => 'nullable|string|max:40',
            'title' => 'required|string|max:120',
            'subtitle' => 'nullable|string|max:255',
            'cta_label' => 'nullable|string|max:40',
            // Path internal (/buku/...) atau URL http(s). Skema lain (javascript:, data:) ditolak.
            'link_url' => ['nullable', 'string', 'max:255', 'regex:#^(/(?!/)|https?://)#i'],
            'theme' => ['required', Rule::in(Banner::THEMES)],
            'sort_order' => 'nullable|integer|min:0|max:999',
            'is_active' => 'nullable|boolean',
            'starts_at' => 'nullable|date',
            'ends_at' => 'nullable|date|after:starts_at',
            'image' => 'nullable|image|mimes:jpg,jpeg,png,webp|max:20480',
        ], [
            'image.max' => 'Ukuran gambar banner maksimal 20 MB.',
            'link_url.regex' => 'Tautan harus diawali "/" (halaman Srawung) atau "https://".',
            'ends_at.after' => 'Waktu selesai harus setelah waktu mulai.',
        ]);

        unset($data['image']);
        $data['sort_order'] = $data['sort_order'] ?? 0;
        $data['is_active'] = $request->boolean('is_active', true);

        return $data;
    }

    private function storeImage(Request $request): ?string
    {
        return $request->hasFile('image') ? CoverImage::store($request->file('image'), 'banners', 'image', 2000, 1400) : null;
    }

    private function deleteImage(?string $path): void
    {
        // Sampul buku bisa dipakai bersama — hanya hapus file yang diunggah khusus untuk banner.
        if ($path && str_starts_with($path, 'banners/')) {
            Storage::disk('public')->delete($path);
        }
    }
}
