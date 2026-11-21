<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\PaymentInfo;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class SettingController extends Controller
{
    public function index()
    {
        $settings = Setting::all()->pluck('value', 'key');
        $settings['qris_url'] = PaymentInfo::imageUrl();

        return response()->json($settings);
    }

    /** Ganti gambar QRIS pembayaran. */
    public function uploadQris(Request $request)
    {
        $request->validate([
            'qris' => 'required|image|mimes:jpg,jpeg,png,webp|max:3072',
        ], [
            'qris.required' => 'Pilih gambar QRIS terlebih dahulu.',
            'qris.max' => 'Ukuran gambar QRIS maksimal 3 MB.',
        ]);

        $old = PaymentInfo::imagePath();
        $path = $request->file('qris')->store('payment', 'public');
        Setting::set('qris_image_path', $path);

        if ($old !== $path && $old !== PaymentInfo::DEFAULT_IMAGE && str_starts_with($old, 'payment/')) {
            Storage::disk('public')->delete($old);
        }

        return response()->json(['message' => 'Gambar QRIS diperbarui.', 'qris_url' => PaymentInfo::imageUrl()]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'settings' => 'required|array',
            'settings.bank_name' => 'sometimes|nullable|string|max:100',
            'settings.bank_account' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[0-9 \-]+$/'],
            'settings.bank_holder' => 'sometimes|nullable|string|max:150',
            'settings.whatsapp_admin' => ['sometimes', 'nullable', 'string', 'max:20', 'regex:/^[0-9]+$/'],
            'settings.payment_deadline_hours' => 'sometimes|nullable|integer|min:1|max:168',
            'settings.payment_message_template' => 'sometimes|nullable|string|max:1000',
            'settings.admin_notification_email' => 'sometimes|nullable|email|max:255',
            'settings.qris_merchant_name' => 'sometimes|nullable|string|max:100',
            'settings.qris_nmid' => ['sometimes', 'nullable', 'string', 'max:40', 'regex:/^[A-Za-z0-9]+$/'],
            'settings.creator_commission_percent' => 'sometimes|nullable|integer|min:0|max:90',
            'settings.creator_min_payout' => 'sometimes|nullable|integer|min:10000|max:10000000',
            'settings.creator_payout_fee' => 'sometimes|nullable|integer|min:0|max:100000',
        ], [
            'settings.qris_nmid.regex' => 'NMID hanya berisi huruf dan angka.',
            'settings.bank_account.regex' => 'Nomor rekening hanya boleh berisi angka.',
            'settings.whatsapp_admin.regex' => 'Nomor WhatsApp admin hanya angka, format 628xxx.',
        ]);

        // Hanya kunci yang dikenal yang boleh disimpan.
        $allowed = ['bank_name', 'bank_account', 'bank_holder', 'whatsapp_admin', 'payment_deadline_hours', 'payment_message_template', 'admin_notification_email', 'qris_merchant_name', 'qris_nmid', 'creator_commission_percent', 'creator_min_payout', 'creator_payout_fee'];
        foreach (array_intersect_key($data['settings'], array_flip($allowed)) as $key => $value) {
            Setting::set($key, $value === null ? null : (string) $value);
        }

        $allSettings = Setting::all()->pluck('value', 'key');

        return response()->json([
            'message' => 'Pengaturan berhasil diperbarui.',
            'settings' => $allSettings,
        ]);
    }
}
