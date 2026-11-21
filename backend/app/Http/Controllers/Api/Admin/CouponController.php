<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Coupon;
use Illuminate\Http\Request;

class CouponController extends Controller
{
    public function index()
    {
        $coupons = Coupon::withCount('orders')->with('creator.creatorProfile:id,user_id,display_name')->latest()->get();
        return response()->json($coupons);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'code' => 'required|string|max:50|unique:coupons,code',
            'type' => 'required|in:percent,fixed',
            'value' => 'required|numeric|min:1',
            'quota' => 'nullable|integer|min:1',
            'expires_at' => 'nullable|date',
            'is_public' => 'nullable|boolean',
            'description' => 'nullable|string|max:160',
        ]);

        $data['is_public'] = $request->boolean('is_public');

        $data['code'] = strtoupper(trim($data['code']));
        $coupon = Coupon::create($data);

        return response()->json([
            'message' => 'Kupon berhasil dibuat.',
            'coupon' => $coupon,
        ], 201);
    }

    public function show($id)
    {
        $coupon = Coupon::with('orders')->findOrFail($id);
        return response()->json($coupon);
    }

    public function update(Request $request, $id)
    {
        $coupon = Coupon::findOrFail($id);

        $data = $request->validate([
            'code' => 'required|string|max:50|unique:coupons,code,' . $coupon->id,
            'type' => 'required|in:percent,fixed',
            'value' => 'required|numeric|min:1',
            'quota' => 'nullable|integer|min:1',
            'expires_at' => 'nullable|date',
            'is_public' => 'nullable|boolean',
            'description' => 'nullable|string|max:160',
        ]);

        $data['is_public'] = $request->boolean('is_public');

        $data['code'] = strtoupper(trim($data['code']));
        $coupon->update($data);

        return response()->json([
            'message' => 'Kupon berhasil diperbarui.',
            'coupon' => $coupon,
        ]);
    }

    public function destroy($id)
    {
        $coupon = Coupon::findOrFail($id);
        $coupon->delete();

        return response()->json(['message' => 'Kupon berhasil dihapus.']);
    }
}
