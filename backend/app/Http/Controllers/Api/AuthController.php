<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Autentikasi berbasis Bearer token (Sanctum personal access token).
 * Tidak ada cookie session / CSRF yang terlibat.
 */
class AuthController extends Controller
{
    public function register(Request $request)
    {
        // Terima format "0812-3456-7890" / "+62 812..." — simpan hanya digit (dan + di depan).
        $request->merge(['whatsapp' => preg_replace('/[^0-9+]/', '', (string) $request->input('whatsapp'))]);

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users',
            'whatsapp' => ['required', 'string', 'max:20', 'regex:/^(\+?62|0)8[0-9]{7,12}$/'],
            'password' => 'required|string|min:8|confirmed',
        ], [
            'email.unique' => 'Email ini sudah terdaftar. Silakan masuk atau gunakan "Lupa sandi".',
            'whatsapp.regex' => 'Nomor WhatsApp tidak valid. Contoh: 081234567890.',
            'password.min' => 'Kata sandi minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi tidak cocok.',
        ]);

        $user = User::create([
            'name' => $data['name'],
            'email' => strtolower($data['email']),
            'whatsapp' => $data['whatsapp'],
            'password' => $data['password'], // di-hash otomatis oleh cast 'hashed'
        ]);
        // Pendaftar selalu pembeli — role tidak pernah diambil dari input.
        $user->forceFill(['role' => 'buyer', 'is_blocked' => false])->save();

        $this->safeNotify(fn () => $user->sendEmailVerificationNotification());

        return response()->json([
            'message' => 'Registrasi berhasil. Cek email Anda untuk verifikasi.',
            'user' => $user,
            'token' => $user->createToken('auth_token')->plainTextToken,
        ], 201);
    }

    public function login(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', strtolower($request->email))->first();

        if ($user && $user->password === null && $user->google_id) {
            throw ValidationException::withMessages([
                'email' => 'Akun ini terdaftar melalui Google. Gunakan tombol "Lanjutkan dengan Google" atau atur kata sandi lewat "Lupa sandi".',
            ]);
        }

        if (!$user || !$user->password || !Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages(['email' => 'Email atau kata sandi salah.']);
        }

        if ($user->is_blocked) {
            return response()->json(['message' => 'Akun Anda diblokir. Hubungi admin Srawung.'], 403);
        }

        return response()->json([
            'message' => 'Login berhasil.',
            'user' => $user,
            'token' => $user->createToken('auth_token')->plainTextToken,
        ]);
    }

    public function logout(Request $request)
    {
        $token = $request->user()?->currentAccessToken();
        if ($token && method_exists($token, 'delete')) {
            $token->delete();
        }

        return response()->json(['message' => 'Logout berhasil.']);
    }

    public function me(Request $request)
    {
        return response()->json(['user' => $request->user()]);
    }

    public function verifyEmail(Request $request, $id, $hash)
    {
        if (!$request->hasValidSignature()) {
            return response()->json(['message' => 'Tautan verifikasi tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru.'], 403);
        }

        $user = User::findOrFail($id);

        if (!hash_equals((string) $hash, sha1($user->getEmailForVerification()))) {
            return response()->json(['message' => 'Tautan verifikasi tidak valid.'], 400);
        }

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email sudah terverifikasi sebelumnya.']);
        }

        $user->markEmailAsVerified();

        return response()->json(['message' => 'Email berhasil diverifikasi.']);
    }

    public function resendVerification(Request $request)
    {
        $user = $request->user();

        if ($user->hasVerifiedEmail()) {
            return response()->json(['message' => 'Email sudah terverifikasi.']);
        }

        $this->safeNotify(fn () => $user->sendEmailVerificationNotification());

        return response()->json(['message' => 'Tautan verifikasi telah dikirim ulang.']);
    }

    public function forgotPassword(Request $request)
    {
        $request->validate(['email' => 'required|email']);

        $status = Password::sendResetLink(['email' => strtolower($request->email)]);

        if ($status === Password::RESET_THROTTLED) {
            return response()->json([
                'message' => 'Tautan reset baru saja dikirim. Tunggu sekitar 1 menit sebelum meminta lagi.',
            ], 429);
        }

        // Respons sama untuk email terdaftar maupun tidak, agar daftar email
        // pengguna tidak bisa ditebak (mencegah user enumeration).
        return response()->json([
            'message' => 'Jika email tersebut terdaftar, tautan reset kata sandi telah dikirim. Periksa kotak masuk (dan folder Spam/Promosi).',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required|string',
            'email' => 'required|email',
            'password' => 'required|string|min:8|confirmed',
        ], [
            'password.min' => 'Kata sandi minimal 8 karakter.',
            'password.confirmed' => 'Konfirmasi kata sandi tidak cocok.',
        ]);

        $status = Password::reset(
            [
                'email' => strtolower($request->email),
                'password' => $request->password,
                'password_confirmation' => $request->password_confirmation,
                'token' => $request->token,
            ],
            function (User $user, string $password) {
                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                    'email_verified_at' => $user->email_verified_at ?? now(),
                ])->save();

                // Keluarkan semua sesi lama demi keamanan.
                $user->tokens()->delete();

                event(new PasswordReset($user));
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['message' => 'Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru.']);
        }

        $message = match ($status) {
            Password::INVALID_TOKEN => 'Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru.',
            Password::INVALID_USER => 'Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru.',
            Password::RESET_THROTTLED => 'Terlalu banyak percobaan. Coba lagi beberapa saat lagi.',
            default => 'Gagal mengatur ulang kata sandi.',
        };

        throw ValidationException::withMessages(['email' => [$message]]);
    }

    /**
     * Login/daftar via Google Identity Services (ID token dari tombol Google).
     */
    public function googleLogin(Request $request)
    {
        $request->validate(['credential' => 'required|string']);

        $payload = $this->verifyGoogleIdToken($request->credential);
        if (!$payload) {
            return response()->json(['message' => 'Token Google tidak valid. Silakan coba lagi.'], 401);
        }

        $user = $this->upsertGoogleUser($payload);
        if ($user->is_blocked) {
            return response()->json(['message' => 'Akun Anda diblokir. Hubungi admin Srawung.'], 403);
        }

        return response()->json([
            'message' => 'Login Google berhasil.',
            'user' => $user,
            'token' => $user->createToken('auth_token')->plainTextToken,
        ]);
    }

    /**
     * Fallback OAuth redirect flow (bila popup Google diblokir peramban).
     */
    public function googleRedirect()
    {
        $query = http_build_query([
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => config('services.google.redirect'),
            'response_type' => 'code',
            'scope' => 'openid profile email',
            'prompt' => 'select_account',
        ]);

        return redirect('https://accounts.google.com/o/oauth2/v2/auth?' . $query);
    }

    public function googleCallback(Request $request)
    {
        $frontendUrl = config('app.frontend_url');
        $code = $request->get('code');

        if (!$code) {
            return redirect($frontendUrl . '/masuk?error=google_failed');
        }

        $response = Http::asForm()->post('https://oauth2.googleapis.com/token', [
            'code' => $code,
            'client_id' => config('services.google.client_id'),
            'client_secret' => config('services.google.client_secret'),
            'redirect_uri' => config('services.google.redirect'),
            'grant_type' => 'authorization_code',
        ]);

        $idToken = $response->successful() ? ($response->json('id_token') ?? null) : null;
        $payload = $idToken ? $this->verifyGoogleIdToken($idToken) : null;

        if (!$payload) {
            return redirect($frontendUrl . '/masuk?error=google_failed');
        }

        $user = $this->upsertGoogleUser($payload);
        if ($user->is_blocked) {
            return redirect($frontendUrl . '/masuk?error=account_blocked');
        }

        $token = $user->createToken('auth_token')->plainTextToken;

        return redirect($frontendUrl . '/auth/callback?token=' . urlencode($token));
    }

    /**
     * Validasi ID token ke Google, pastikan diterbitkan untuk Client ID kita
     * dan email sudah diverifikasi Google.
     */
    private function verifyGoogleIdToken(string $idToken): ?array
    {
        try {
            $response = Http::timeout(10)->get('https://oauth2.googleapis.com/tokeninfo', ['id_token' => $idToken]);
        } catch (\Throwable $e) {
            Log::warning('Google tokeninfo gagal: ' . $e->getMessage());
            return null;
        }

        if (!$response->successful()) {
            return null;
        }

        $payload = $response->json();
        $clientId = config('services.google.client_id');

        if (($payload['aud'] ?? null) !== $clientId) {
            return null;
        }
        if (!in_array($payload['iss'] ?? '', ['accounts.google.com', 'https://accounts.google.com'], true)) {
            return null;
        }
        if (empty($payload['email']) || empty($payload['sub'])) {
            return null;
        }
        if (!filter_var($payload['email_verified'] ?? false, FILTER_VALIDATE_BOOLEAN)) {
            return null;
        }

        return $payload;
    }

    private function upsertGoogleUser(array $payload): User
    {
        $email = strtolower($payload['email']);
        $googleId = $payload['sub'];
        $avatar = $payload['picture'] ?? null;

        $user = User::where('google_id', $googleId)->orWhere('email', $email)->first();

        if ($user) {
            if (!$user->is_blocked) {
                $user->forceFill([
                    'google_id' => $googleId,
                    'avatar' => $avatar ?? $user->avatar,
                    'email_verified_at' => $user->email_verified_at ?? now(),
                ])->save();
            }

            return $user;
        }

        return User::forceCreate([
            'name' => $payload['name'] ?? Str::before($email, '@'),
            'email' => $email,
            'google_id' => $googleId,
            'avatar' => $avatar,
            'whatsapp' => null,
            'password' => null,
            'role' => 'buyer',
            'is_blocked' => false,
            'email_verified_at' => now(),
        ]);
    }

    /**
     * Kegagalan pengiriman email tidak boleh menggagalkan request utama.
     */
    private function safeNotify(callable $send): void
    {
        try {
            $send();
        } catch (\Throwable $e) {
            Log::error('Gagal mengantrekan email: ' . $e->getMessage());
        }
    }
}
