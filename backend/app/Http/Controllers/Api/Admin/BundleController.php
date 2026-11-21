<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\Bundle;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class BundleController extends Controller
{
    public function index()
    {
        $bundles = Bundle::with('books:id,title,slug,price,sale_price,sale_ends_at,cover_path,status')
            ->withCount(['books'])
            ->orderBy('sort')
            ->latest()
            ->get()
            ->map(function (Bundle $b) {
                $sold = \App\Models\OrderItem::where('bundle_id', $b->id)
                    ->whereHas('order', fn ($q) => $q->where('status', 'dikonfirmasi'))
                    ->distinct('order_id')
                    ->count('order_id');

                return [
                    ...$b->only(['id', 'title', 'slug', 'description', 'price', 'is_active', 'sort']),
                    'starts_at' => $b->starts_at?->toIso8601String(),
                    'ends_at' => $b->ends_at?->toIso8601String(),
                    'is_available' => $b->isAvailable(),
                    'sold' => $sold,
                    ...collect($b->toStorefront())->only(['individual_total', 'savings', 'savings_percent', 'books'])->all(),
                ];
            });

        return response()->json($bundles);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $bundle = Bundle::create($data + ['slug' => $this->uniqueSlug($data['title'])]);
        $this->syncBooks($bundle, $request->input('book_ids'));

        return response()->json(['message' => 'Paket dibuat.', 'bundle' => $bundle], 201);
    }

    public function update(Request $request, $id)
    {
        $bundle = Bundle::findOrFail($id);
        $data = $this->validated($request, $bundle);
        if ($data['title'] !== $bundle->title) {
            $data['slug'] = $this->uniqueSlug($data['title'], $bundle->id);
        }
        $bundle->update($data);
        $this->syncBooks($bundle, $request->input('book_ids'));

        return response()->json(['message' => 'Paket diperbarui.', 'bundle' => $bundle]);
    }

    public function destroy($id)
    {
        $bundle = Bundle::findOrFail($id);
        // Riwayat pesanan tetap aman: order_items.bundle_id menjadi null (nullOnDelete).
        $bundle->delete();

        return response()->json(['message' => 'Paket dihapus.']);
    }

    private function validated(Request $request, ?Bundle $bundle = null): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:120'],
            'description' => 'nullable|string|max:1000',
            'price' => 'required|integer|min:1000',
            'is_active' => 'boolean',
            'starts_at' => 'nullable|date',
            'ends_at' => 'nullable|date|after:starts_at',
            'sort' => 'nullable|integer',
            'book_ids' => 'required|array|min:2|max:30',
            'book_ids.*' => ['integer', Rule::exists('books', 'id')],
        ], [
            'book_ids.min' => 'Paket minimal berisi 2 buku.',
            'price.min' => 'Harga paket minimal Rp1.000.',
            'ends_at.after' => 'Waktu berakhir harus setelah waktu mulai.',
        ]);

        $books = Book::whereIn('id', $data['book_ids'])->get();
        $individual = $books->sum(fn (Book $b) => $b->currentPrice());
        if ($data['price'] >= $individual) {
            abort(response()->json([
                'message' => 'Harga paket harus lebih murah dari total harga satuan (Rp' . number_format($individual, 0, ',', '.') . ').',
                'errors' => ['price' => ['Harga paket harus lebih murah dari total harga satuan.']],
            ], 422));
        }

        unset($data['book_ids']);
        $data['is_active'] = $request->boolean('is_active', true);
        $data['sort'] ??= 0;

        return $data;
    }

    private function syncBooks(Bundle $bundle, array $ids): void
    {
        $bundle->books()->sync(collect($ids)->values()->mapWithKeys(fn ($id, $i) => [(int) $id => ['sort' => $i]])->all());
    }

    private function uniqueSlug(string $title, ?int $ignoreId = null): string
    {
        $base = Str::slug($title) ?: 'paket';
        $slug = $base;
        $i = 2;
        while (Bundle::where('slug', $slug)->when($ignoreId, fn ($q) => $q->whereKeyNot($ignoreId))->exists()) {
            $slug = "{$base}-{$i}";
            $i++;
        }

        return $slug;
    }
}
