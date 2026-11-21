<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AccountService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ProfileController extends Controller
{
    public function show(Request $request)
    {
        return response()->json($request->user());
    }

    public function update(Request $request)
    {
        $user = $request->user();

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'whatsapp' => 'required|string|max:20',
            'email' => ['sometimes', 'required', 'email:rfc', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'current_password' => 'nullable|string',
            'password' => 'nullable|string|min:8|confirmed',
        ], [
            'email.unique' => 'Email ini sudah dipakai akun lain.',
            'email.email' => 'Format email tidak valid.',
        ]);

        $newEmail = isset($data['email']) ? strtolower(trim($data['email'])) : null;
        $emailChanged = $newEmail !== null && $newEmail !== strtolower($user->email);

        if ($emailChanged && $user->google_id) {
            throw ValidationException::withMessages(['email' => 'Email akun yang terhubung dengan Google tidak dapat diubah.']);
        }

        // Mengganti email atau kata sandi wajib menyertakan kata sandi saat ini.
        if ($emailChanged || !empty($data['password'])) {
            if (empty($data['current_password']) || !Hash::check($data['current_password'], $user->password)) {
                throw ValidationException::withMessages([
                    'current_password' => 'Kata sandi saat ini tidak cocok.',
                ]);
            }
        }

        if (!empty($data['password'])) {
            $user->password = Hash::make($data['password']);
        }

        if ($emailChanged) {
            $user->email = $newEmail;
            $user->email_verified_at = null;
        }

        $user->name = $data['name'];
        $user->whatsapp = $data['whatsapp'];
        $user->save();

        if ($emailChanged) {
            try {
                $user->sendEmailVerificationNotification();
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return response()->json([
            'message' => $emailChanged
                ? "Profil diperbarui. Tautan verifikasi telah dikirim ke {$newEmail}."
                : 'Profil berhasil diperbarui.',
            'user' => $user,
            'email_changed' => $emailChanged,
        ]);
    }

    /** Hapus akun (UU PDP: hak penghapusan). */
    public function destroy(Request $request, AccountService $accounts)
    {
        $user = $request->user();

        if ($user->role === 'creator') {
            return response()->json([
                'message' => 'Akun kreator masih memegang buku yang dijual dan saldo pendapatan. Hubungi admin untuk menutup akun kreator terlebih dahulu.',
            ], 422);
        }

        // Akun berkata sandi: konfirmasi kata sandi. Akun Google: ketik "HAPUS".
        if ($user->google_id) {
            $request->validate(['confirmation' => 'required|in:HAPUS'], ['confirmation.in' => 'Ketik HAPUS (huruf besar) untuk mengonfirmasi.', 'confirmation.required' => 'Ketik HAPUS untuk mengonfirmasi.']);
        } else {
            $request->validate(['password' => 'required|string'], ['password.required' => 'Masukkan kata sandi untuk mengonfirmasi.']);
            if (!Hash::check($request->password, $user->password)) {
                throw ValidationException::withMessages(['password' => 'Kata sandi tidak cocok.']);
            }
        }

        if ($user->role === 'admin') {
            abort(422, 'Akun admin tidak dapat dihapus dari sini.');
        }

        $blocking = $accounts->blockingOrders($user);
        if ($blocking->isNotEmpty()) {
            abort(422, 'Akun belum bisa dihapus karena pembayaran pesanan ' . $blocking->implode(', ') . ' sedang diverifikasi. Tunggu hingga selesai, lalu coba lagi.');
        }

        $accounts->anonymize($user);

        return response()->json(['message' => 'Akun Anda telah dihapus. Terima kasih telah membaca bersama Srawung.']);
    }
}
