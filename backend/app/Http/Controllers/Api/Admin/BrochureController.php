<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Services\BrochurePdf;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** Brosur promosi PDF dari buku pilihan admin. */
class BrochureController extends Controller
{
    public function generate(Request $request)
    {
        $data = $request->validate([
            'book_ids' => ['required', 'array', 'min:1', 'max:' . BrochurePdf::MAX_BOOKS],
            'book_ids.*' => ['integer', 'distinct', Rule::exists('books', 'id')->where('status', 'published')],
            'layout' => ['required', Rule::in(BrochurePdf::LAYOUTS)],
            'title' => ['nullable', 'string', 'max:60'],
            'subtitle' => ['nullable', 'string', 'max:160'],
            'promo_code' => ['nullable', 'string', 'max:30'],
            'promo_note' => ['nullable', 'string', 'max:120'],
            'show_prices' => ['boolean'],
            'include_cover' => ['boolean'],
        ], [
            'book_ids.required' => 'Pilih minimal satu buku.',
            'book_ids.max' => 'Maksimal ' . BrochurePdf::MAX_BOOKS . ' buku per brosur.',
            'book_ids.*.exists' => 'Hanya buku berstatus Terbit yang bisa masuk brosur.',
        ]);

        // Pertahankan urutan pilihan admin.
        $order = array_flip($data['book_ids']);
        $books = Book::with('category')->whereIn('id', $data['book_ids'])->get()
            ->sortBy(fn (Book $b) => $order[$b->id])->values();

        $pdf = BrochurePdf::render($books, $data);

        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'inline; filename="' . BrochurePdf::filename() . '"',
            'Cache-Control' => 'no-store',
        ]);
    }
}
