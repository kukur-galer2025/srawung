<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Rules\SafeName;
use App\Rules\StrongPassword;
use App\Services\AccountService;
use App\Services\Security\LoginSession;
use App\Services\Security\SecurityLog;
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

        $request->merge(['whatsapp' => preg_replace('/[^0-9+]/', '', is_string($request->input('whatsapp')) ? $request->input('whatsapp') : '')]);
        $data = $request->validate([
            'name' => ['required', 'string', new SafeName],
            'whatsapp' => ['required', 'string', 'max:20', 'regex:/^(\+?62|0)8[0-9]{7,12}$/'],
            'email' => ['sometimes', 'required', 'string', 'email:rfc', 'max:255', Rule::unique('users', 'email')->ignore($user->id)],
            'current_password' => 'nullable|string|max:200',
            'password' => ['nullable', 'string', 'confirmed', new StrongPassword($user->email)],
        ], [
            'whatsapp.regex' => 'Nomor WhatsApp tidak valid. Contoh: 081234567890.',
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
            if (empty($data['current_password']) || !$user->password || !Hash::check($data['current_password'], $user->password)) {
                SecurityLog::record('profile.wrong_password', $user);
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

        $oldEmail = $user->getOriginal('email');
        $user->name = $data['name'];
        $user->whatsapp = $data['whatsapp'];
        $user->save();

        // Sandi/email berganti → perangkat lain dikeluarkan & pemilik lama diberi tahu.
        if (!empty($data['password']) || $emailChanged) {
            $current = $user->currentAccessToken();
            LoginSession::revokeAll($user, $current instanceof \Laravel\Sanctum\PersonalAccessToken ? $current->id : null);
            SecurityLog::record($emailChanged ? 'email.changed' : 'password.changed', $user);
            if ($emailChanged) {
                \Illuminate\Support\Facades\Notification::route('mail', $oldEmail)->notify(new \App\Notifications\SecurityNotice('Email akun Srawung diganti', ['Email akun Srawung Anda diganti ke alamat lain. Semua perangkat lain sudah dikeluarkan.']));
            } else {
                SecurityLog::notify($user, 'Kata sandi diubah', ['Kata sandi akun Srawung Anda baru saja diubah. Semua perangkat lain sudah dikeluarkan.']);
            }
        }

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
            if (!$user->password || !Hash::check($request->password, $user->password)) {
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
