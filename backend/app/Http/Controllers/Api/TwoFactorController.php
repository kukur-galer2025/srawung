<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Security\LoginSession;
use App\Services\Security\SecurityLog;
use App\Services\Security\Totp;
use App\Services\Security\TwoFactor;
use chillerlan\QRCode\Output\QRGdImagePNG;
use chillerlan\QRCode\QRCode;
use chillerlan\QRCode\QROptions;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/** Aktif/nonaktifkan verifikasi dua langkah (admin & kreator). */
class TwoFactorController extends Controller
{
    public function setup(Request $request)
    {
        $user = $this->eligible($request);
        abort_if($user->two_factor_enabled, 422, 'Verifikasi dua langkah sudah aktif.');
        $this->confirmPassword($request, $user);

        $secret = TwoFactor::start($user);

        return response()->json([
            'secret' => implode(' ', str_split($secret, 4)),
            'qr' => (new QRCode(new QROptions(['outputInterface' => QRGdImagePNG::class, 'outputBase64' => true, 'scale' => 6, 'quietzoneSize' => 2])))
                ->render(Totp::uri($secret, $user->email)),
        ])->header('Cache-Control', 'no-store');
    }

    public function confirm(Request $request)
    {
        $user = $this->eligible($request);
        $data = $request->validate(['code' => 'required|string|max:10']);
        $codes = TwoFactor::confirm($user, preg_replace('/\s+/', '', $data['code']));
        if (!$codes) {
            throw ValidationException::withMessages(['code' => 'Kode salah. Pastikan jam ponsel otomatis, lalu masukkan kode terbaru.']);
        }

        // Perangkat lain yang login tanpa 2FA dikeluarkan.
        $current = $user->currentAccessToken();
        LoginSession::revokeAll($user, $current instanceof \Laravel\Sanctum\PersonalAccessToken ? $current->id : null);
        SecurityLog::record('2fa.enabled', $user);
        SecurityLog::notify($user, 'Verifikasi dua langkah diaktifkan', ['Mulai sekarang login ke akun Anda memerlukan kode dari aplikasi authenticator.']);

        return response()->json(['message' => 'Verifikasi dua langkah aktif.', 'recovery_codes' => $codes])->header('Cache-Control', 'no-store');
    }

    public function disable(Request $request)
    {
        $user = $this->eligible($request);
        $data = $request->validate(['code' => 'required|string|max:20']);
        if (!TwoFactor::verify($user, $data['code'])) {
            SecurityLog::record('2fa.disable_failed', $user);

            throw ValidationException::withMessages(['code' => 'Kode salah atau sudah dipakai. Tunggu kode berikutnya lalu coba lagi.']);
        }

        TwoFactor::disable($user);
        SecurityLog::record('2fa.disabled', $user);
        SecurityLog::notify($user, 'Verifikasi dua langkah dimatikan', ['Login ke akun Anda kini hanya memerlukan kata sandi atau Google.']);
        if ($user->role === 'admin') {
            SecurityLog::notifyAdmins('2FA akun admin dimatikan', ["Verifikasi dua langkah untuk {$user->email} dimatikan."]);
        }

        return response()->json(['message' => 'Verifikasi dua langkah dimatikan.']);
    }

    private function eligible(Request $request): User
    {
        abort_unless(TwoFactor::allowedFor($request->user()), 403, 'Fitur ini untuk akun admin dan kreator.');

        return $request->user()->fresh()->withAccessToken($request->user()->currentAccessToken());
    }

    /** Akun berkata sandi harus memasukkannya lagi, agar sesi yang tertinggal terbuka tidak bisa dipakai memasang 2FA orang lain. */
    private function confirmPassword(Request $request, User $user): void
    {
        if (!$user->password) {
            return;
        }
        $data = $request->validate(['password' => 'required|string|max:200'], ['password.required' => 'Masukkan kata sandi Anda.']);
        if (!Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages(['password' => 'Kata sandi tidak cocok.']);
        }
    }
}
