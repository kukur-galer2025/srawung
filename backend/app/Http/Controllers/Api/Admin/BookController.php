<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Jobs\ProcessBookPages;
use App\Models\Book;
use App\Services\CoverImage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class BookController extends Controller
{
    /*
     * Titik kustomisasi — CreatorBookController menimpa ketiganya agar kreator
     * hanya bisa melihat & mengubah bukunya sendiri.
     */
    protected function books()
    {
        return Book::query();
    }

    /** @return array<string, mixed> data tambahan saat buku dibuat */
    protected function ownerData(Request $request): array
    {
        return [];
    }

    protected function rules(): array
    {
        return [
            'title' => 'required|string|max:255',
            'author' => 'required|string|max:255',
            'synopsis' => 'required|string',
            'price' => 'required|numeric|min:0',
            'sale_price' => 'nullable|integer|min:0|lt:price',
            'sale_ends_at' => 'nullable|date|after:now',
            'category_id' => 'nullable|exists:categories,id',
            'next_book_id' => 'nullable|integer|exists:books,id',
            'total_pages' => 'nullable|integer|min:0',
            'preview_pages' => 'nullable|integer|min:1',
            'status' => 'required|in:draft,published',
            // Ukuran bebas — sampul otomatis dikonversi ke WebP ringan (App\Services\CoverImage).
            'cover' => 'nullable|file|mimes:jpg,jpeg,png,webp,gif,bmp,avif',
        ];
    }

    public function index(Request $request)
    {
        $query = $this->books()->with(['category', 'creator.creatorProfile'])->latest();

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                  ->orWhere('author', 'like', "%{$search}%");
            });
        }

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        $books = $query->paginate(min(max((int) $request->query("per_page", 15), 1), 100));
        $books->getCollection()->each->makeVisible(Book::MANAGER_FIELDS);

        return response()->json($books);
    }

    public function store(Request $request)
    {
        $data = $request->validate($this->rules(), [
            'sale_price.lt' => 'Harga promo harus lebih murah dari harga normal.',
            'sale_ends_at.after' => 'Promo harus berakhir di waktu yang akan datang.',
        ]);
        // Harga promo kosong = promo dimatikan.
        if (empty($data['sale_price'])) {
            $data['sale_price'] = null;
            $data['sale_ends_at'] = null;
        }

        $slug = Str::slug($data['title']);
        $originalSlug = $slug;
        $counter = 1;
        while (Book::where('slug', $slug)->exists()) {
            $slug = "{$originalSlug}-{$counter}";
            $counter++;
        }
        $data['slug'] = $slug;

        if ($request->hasFile('cover')) {
            $data['cover_path'] = CoverImage::store($request->file('cover'));
        }

        $book = Book::create($data + $this->ownerData($request));

        return response()->json([
            'message' => 'Buku berhasil ditambahkan.',
            'book' => $book->load('category')->makeVisible(Book::MANAGER_FIELDS),
        ], 201);
    }

    public function show($id)
    {
        $book = $this->books()->with(['category', 'pages:id,book_id,page_number,image_path'])->findOrFail($id);
        return response()->json($book->makeVisible(Book::MANAGER_FIELDS));
    }

    public function update(Request $request, $id)
    {
        $book = $this->books()->findOrFail($id);
        if ((int) $request->input('next_book_id') === $book->id) {
            return response()->json(['message' => 'Buku lanjutan tidak boleh buku itu sendiri.', 'errors' => ['next_book_id' => ['Pilih buku lain.']]], 422);
        }

        $data = $request->validate($this->rules(), [
            'sale_price.lt' => 'Harga promo harus lebih murah dari harga normal.',
            'sale_ends_at.after' => 'Promo harus berakhir di waktu yang akan datang.',
        ]);
        // Harga promo kosong = promo dimatikan.
        if (empty($data['sale_price'])) {
            $data['sale_price'] = null;
            $data['sale_ends_at'] = null;
        }

        if ($data['title'] !== $book->title) {
            $slug = Str::slug($data['title']);
            $originalSlug = $slug;
            $counter = 1;
            while (Book::where('slug', $slug)->where('id', '!=', $book->id)->exists()) {
                $slug = "{$originalSlug}-{$counter}";
                $counter++;
            }
            $data['slug'] = $slug;
        }

        if ($request->hasFile('cover')) {
            // Simpan yang baru dulu: bila ditolak, sampul lama tidak ikut hilang.
            $data['cover_path'] = CoverImage::store($request->file('cover'));
            if ($book->cover_path && Storage::disk('public')->exists($book->cover_path)) {
                Storage::disk('public')->delete($book->cover_path);
            }
        }

        $book->update($data);

        return response()->json([
            'message' => 'Buku berhasil diperbarui.',
            'book' => $book->load('category')->makeVisible(Book::MANAGER_FIELDS),
        ]);
    }

    public function destroy($id)
    {
        $book = $this->books()->findOrFail($id);

        if ($book->cover_path && Storage::disk('public')->exists($book->cover_path)) {
            Storage::disk('public')->delete($book->cover_path);
        }

        if ($book->source_file_path && Storage::disk('local')->exists($book->source_file_path)) {
            Storage::disk('local')->delete($book->source_file_path);
        }

        Storage::disk('local')->deleteDirectory("books/{$book->id}");

        $book->delete();

        return response()->json(['message' => 'Buku berhasil dihapus.']);
    }

    public function uploadFile(Request $request, $id)
    {
        $request->validate([
            'file' => 'required|file|mimes:pdf', // ukuran bebas (dibatasi hanya oleh upload_max_filesize server)
        ]);

        $book = $this->books()->findOrFail($id);
        $file = $request->file('file');
        $fileName = 'source.pdf';
        $path = $file->storeAs("books/{$book->id}", $fileName, 'local');

        $book->update([
            'source_file_path' => $path,
            'processing_status' => 'pending',
            'processing_error' => null,
        ]);

        ProcessBookPages::dispatch($book->id);

        return response()->json([
            'message' => 'File buku berhasil diunggah dan sedang diproses.',
            'book' => $book->fresh('category')->makeVisible(Book::MANAGER_FIELDS),
        ]);
    }

    /**
     * Ulangi konversi PDF yang sudah terunggah (mis. setelah gagal).
     */
    public function reprocess($id)
    {
        $book = $this->books()->findOrFail($id);

        if (!$book->source_file_path) {
            return response()->json(['message' => 'Buku ini belum memiliki file PDF.'], 422);
        }

        $book->update(['processing_status' => 'pending', 'processing_error' => null]);
        ProcessBookPages::dispatch($book->id);

        return response()->json([
            'message' => 'Konversi PDF dijadwalkan ulang.',
            'book' => $book->fresh('category')->makeVisible(Book::MANAGER_FIELDS),
        ]);
    }
}
