<?php

namespace App\Http\Controllers\Api\Creator;

use App\Http\Controllers\Controller;
use App\Models\Coupon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Voucher kreator: hanya memotong harga buku milik kreator tsb. (semua bukunya, atau
 * buku tertentu yang dipilih); diskonnya ditanggung kreator.
 */
class CouponController extends Controller
{
    public function index(Request $request)
    {
        return response()->json(
            Coupon::with('books:id,title')->withCount('orders')->where('creator_id', $request->user()->id)->latest()->get()
        );
    }

    public function store(Request $request)
    {
        [$data, $bookIds] = $this->validated($request);
        $coupon = Coupon::create($data + ['creator_id' => $request->user()->id, 'used_count' => 0, 'is_public' => false]);
        $coupon->books()->sync($bookIds);

        return response()->json(['message' => 'Voucher dibuat. Bagikan kodenya ke pembaca Anda.', 'coupon' => $coupon->load('books:id,title')], 201);
    }

    public function update(Request $request, $id)
    {
        $coupon = Coupon::where('creator_id', $request->user()->id)->findOrFail($id);
        [$data, $bookIds] = $this->validated($request, $coupon->id);
        $coupon->update($data);
        $coupon->books()->sync($bookIds);

        return response()->json(['message' => 'Voucher diperbarui.', 'coupon' => $coupon->load('books:id,title')]);
    }

    public function destroy(Request $request, $id)
    {
        $coupon = Coupon::where('creator_id', $request->user()->id)->findOrFail($id);
        if ($coupon->orders()->exists()) {
            // Riwayat pesanan tetap merujuk voucher ini → nonaktifkan saja.
            $coupon->update(['expires_at' => now()->subMinute()]);

            return response()->json(['message' => 'Voucher sudah pernah dipakai, jadi dinonaktifkan (tidak dihapus).']);
        }
        $coupon->delete();

        return response()->json(['message' => 'Voucher dihapus.']);
    }

    /** @return array{0: array, 1: list<int>} data voucher & ID buku pilihan */
    private function validated(Request $request, ?int $ignoreId = null): array
    {
        $request->merge(['code' => strtoupper(trim((string) $request->input('code')))]);
        $data = $request->validate([
            'code' => ['required', 'string', 'min:4', 'max:30', 'regex:/^[A-Z0-9_-]+$/', Rule::unique('coupons', 'code')->ignore($ignoreId)],
            'type' => 'required|in:percent,fixed',
            'value' => ['required', 'integer', 'min:1', $request->input('type') === 'percent' ? 'max:90' : 'max:1000000'],
            'quota' => 'nullable|integer|min:1|max:100000',
            'expires_at' => 'nullable|date|after:now',
            'description' => 'nullable|string|max:160',
            'restrict_books' => 'nullable|boolean',
            // Hanya buku milik kreator yang login — buku Srawung/kreator lain ditolak.
            'book_ids' => ['nullable', 'array', 'max:200', 'required_if_accepted:restrict_books'],
            'book_ids.*' => ['integer', 'distinct', Rule::exists('books', 'id')->where('creator_id', $request->user()->id)],
        ], [
            'book_ids.required_if_accepted' => 'Pilih minimal satu buku untuk voucher ini.',
            'book_ids.*.exists' => 'Voucher hanya bisa dipakai untuk buku milik Anda sendiri.',
            'code.unique' => 'Kode ini sudah dipakai. Coba kode lain.',
            'code.regex' => 'Kode hanya boleh huruf, angka, - dan _.',
            'value.max' => 'Diskon persen maksimal 90%.',
            'expires_at.after' => 'Tanggal berakhir harus di masa depan.',
        ]);

        $restrict = (bool) ($data['restrict_books'] ?? false);
        $bookIds = $restrict ? array_values(array_map('intval', $data['book_ids'] ?? [])) : [];
        unset($data['book_ids']);
        $data['restrict_books'] = $restrict;

        return [$data, $bookIds];
    }
}
