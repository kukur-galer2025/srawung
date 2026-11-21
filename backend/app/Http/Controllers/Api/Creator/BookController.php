<?php

namespace App\Http\Controllers\Api\Creator;

use App\Http\Controllers\Api\Admin\BookController as AdminBookController;
use App\Models\Book;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Buku milik kreator. Logikanya sama dengan admin (unggah PDF → konversi halaman,
 * sampul, promo), tetapi setiap query dibatasi ke buku milik kreator yang login.
 */
class BookController extends AdminBookController
{
    protected function books()
    {
        return Book::where('creator_id', request()->user()->id);
    }

    /** Buku baru hanya bisa dibuat setelah kreator menyetujui S&K Kreator versi terbaru. */
    public function store(Request $request)
    {
        if (!$request->user()->creatorProfile?->acceptedCurrentTerms()) {
            return response()->json(['message' => 'Setujui Syarat & Ketentuan Kreator sebelum menerbitkan buku.', 'code' => 'terms_required'], 422);
        }

        return parent::store($request);
    }

    protected function ownerData(Request $request): array
    {
        return ['creator_id' => $request->user()->id];
    }

    protected function rules(): array
    {
        return [
            ...parent::rules(),
            // Buku lanjutan hanya boleh buku milik kreator itu sendiri.
            'next_book_id' => ['nullable', 'integer', Rule::exists('books', 'id')->where('creator_id', request()->user()->id)],
        ];
    }

    public function destroy($id)
    {
        $book = $this->books()->findOrFail($id);
        if (OrderItem::where('book_id', $book->id)->exists()) {
            return response()->json([
                'message' => 'Buku yang sudah pernah dibeli tidak bisa dihapus (pembeli tetap berhak membacanya). Ubah statusnya menjadi Draf untuk menghentikan penjualan.',
            ], 422);
        }

        return parent::destroy($id);
    }
}
