<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Rules\SafeName;
use App\Rules\StrongPassword;
use App\Services\Security\LoginSession;
use App\Services\Security\SecurityLog;
use App\Services\Security\TwoFactor;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
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
            'name' => ['required', 'string', new SafeName],
            'email' => 'required|string|email:rfc|max:255|unique:users',
            'whatsapp' => ['required', 'string', 'max:20', 'regex:/^(\+?62|0)8[0-9]{7,12}$/'],
            'password' => ['required', 'string', 'confirmed', new StrongPassword((string) $request->input('email'))],
        ], [
            'email.unique' => 'Email ini sudah terdaftar. Silakan masuk atau gunakan "Lupa sandi".',
            'whatsapp.regex' => 'Nomor WhatsApp tidak valid. Contoh: 081234567890.',
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

        return response()->json(LoginSession::issue($user, $request, 'register', 'Registrasi berhasil. Cek email Anda untuk verifikasi.'), 201);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|string|email|max:255',
            'password' => 'required|string|max:200',
        ]);

        $email = strtolower($data['email']);
        $user = User::where('email', $email)->first();

        if ($wait = LoginSession::lockedFor($email, $request, $user)) {
            return response()->json(['message' => "Terlalu banyak percobaan masuk. Coba lagi dalam {$wait} detik, atau gunakan \"Lupa sandi\"."], 429)
                ->header('Retry-After', (string) $wait);
        }

        // Pesan sama untuk email tak terdaftar, akun Google, dan sandi salah: daftar akun tidak bisa ditebak.
        if (!LoginSession::passwordMatches($user, $data['password'])) {
            LoginSession::failed($email, $request, $user);

            throw ValidationException::withMessages(['email' => 'Email atau kata sandi salah. Bila Anda mendaftar dengan Google, gunakan tombol "Lanjutkan dengan Google".']);
        }

        if ($user->is_blocked) {
            return response()->json(['message' => 'Akun Anda diblokir. Hubungi admin Srawung.'], 403);
        }

        return response()->json(LoginSession::begin($user, $request, 'password', 'Login berhasil.'));
    }

    /** Langkah kedua login: kode authenticator atau kode pemulihan. */
    public function twoFactorChallenge(Request $request)
    {
        $data = $request->validate([
            'challenge' => 'required|string|size:64',
            'code' => 'required|string|max:20',
        ]);

        $user = TwoFactor::solve($data['challenge'], $data['code']);
        if (!$user) {
            SecurityLog::record('2fa.failed');

            throw ValidationException::withMessages(['code' => 'Kode salah atau sudah kedaluwarsa. Coba kode terbaru, atau ulangi masuk dari awal.']);
        }

        return response()->json(LoginSession::issue($user, $request, '2fa', 'Login berhasil.'));
    }

    public function logout(Request $request)
    {
        $token = $request->user()?->currentAccessToken();
        if ($token && method_exists($token, 'delete')) {
            $token->delete();
        }

        return response()->json(['message' => 'Logout berhasil.']);
    }

    /** Keluarkan semua perangkat lain. */
    public function logoutOthers(Request $request)
    {
        $current = $request->user()->currentAccessToken();
        LoginSession::revokeAll($request->user(), $current instanceof \Laravel\Sanctum\PersonalAccessToken ? $current->id : null);
        SecurityLog::record('logout.others', $request->user());

        return response()->json(['message' => 'Semua perangkat lain sudah dikeluarkan.']);
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
        $request->validate(['email' => 'required|string|email|max:255']);

        $status = Password::sendResetLink(['email' => strtolower($request->email)]);

        // Respons sama untuk email terdaftar, tidak terdaftar, maupun permintaan yang terlalu
        // rapat (jeda 1 menit hanya berlaku untuk email terdaftar, jadi pesannya akan membocorkan).
        unset($status);
        return response()->json([
            'message' => 'Jika email tersebut terdaftar, tautan reset kata sandi telah dikirim. Periksa kotak masuk (dan folder Spam/Promosi).',
        ]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'token' => 'required|string|max:200',
            'email' => 'required|string|email|max:255',
            'password' => ['required', 'string', 'confirmed', new StrongPassword((string) $request->input('email'))],
        ], [
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
                LoginSession::revokeAll($user);
                SecurityLog::record('password.reset', $user);
                SecurityLog::notify($user, 'Kata sandi Anda telah diatur ulang', ['Kata sandi akun Srawung Anda baru saja diatur ulang dan semua perangkat dikeluarkan.']);

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
        $request->validate(['credential' => 'required|string|max:5000']);

        $payload = $this->verifyGoogleIdToken($request->credential);
        if (!$payload) {
            return response()->json(['message' => 'Token Google tidak valid. Silakan coba lagi.'], 401);
        }

        $user = $this->upsertGoogleUser($payload);
        if (!$user) {
            return response()->json(['message' => 'Email ini sudah terhubung dengan akun Google lain. Hubungi admin Srawung.'], 409);
        }
        if ($user->is_blocked) {
            return response()->json(['message' => 'Akun Anda diblokir. Hubungi admin Srawung.'], 403);
        }

        return response()->json(LoginSession::begin($user, $request, 'google', 'Login Google berhasil.'));
    }

    /**
     * Fallback OAuth redirect flow (bila popup Google diblokir peramban).
     *
     * Aman dari login CSRF & pencurian token: "state" diikat ke cookie peramban ini, dan hasil
     * akhirnya bukan token melainkan kode sekali pakai (60 detik) yang hanya bisa ditukar oleh
     * tab yang memulai login (pemegang "verifier", gaya PKCE). Token tidak pernah ada di URL.
     */
    public function googleRedirect(Request $request)
    {
        $challenge = (string) $request->query('challenge');
        if (!preg_match('/^[a-f0-9]{64}$/', $challenge)) {
            return redirect(config('app.frontend_url') . '/masuk?error=google_failed');
        }
        $state = Str::random(40);
        Cache::put("google-state:{$state}", $challenge, 600);

        $query = http_build_query([
            'state' => $state,
            'client_id' => config('services.google.client_id'),
            'redirect_uri' => config('services.google.redirect'),
            'response_type' => 'code',
            'scope' => 'openid profile email',
            'prompt' => 'select_account',
        ]);

        return redirect('https://accounts.google.com/o/oauth2/v2/auth?' . $query)
            ->withCookie(cookie('google_state', $state, 10, '/', null, $request->isSecure(), true, false, 'lax'));
    }

    public function googleCallback(Request $request)
    {
        $frontendUrl = config('app.frontend_url');
        $code = $request->query('code');
        $state = (string) $request->query('state');
        $challenge = $state !== '' ? Cache::pull("google-state:{$state}") : null;

        if (!is_string($code) || $code === '' || !$challenge || !hash_equals($state, (string) $request->cookie('google_state'))) {
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
        if (!$user) {
            return redirect($frontendUrl . '/masuk?error=google_failed');
        }
        if ($user->is_blocked) {
            return redirect($frontendUrl . '/masuk?error=account_blocked');
        }

        $exchange = Str::random(64);
        Cache::put('google-exchange:' . hash('sha256', $exchange), ['user_id' => $user->id, 'challenge' => $challenge], 60);

        return redirect($frontendUrl . '/auth/callback?code=' . $exchange)->withoutCookie('google_state');
    }

    /** Tukar kode sekali pakai dari alur redirect Google menjadi sesi login. */
    public function googleExchange(Request $request)
    {
        $data = $request->validate(['code' => 'required|string|size:64', 'verifier' => 'required|string|min:40|max:128']);

        $entry = Cache::pull('google-exchange:' . hash('sha256', $data['code']));
        if (!$entry || !hash_equals($entry['challenge'], hash('sha256', $data['verifier']))) {
            return response()->json(['message' => 'Sesi login Google tidak valid atau sudah kedaluwarsa. Silakan coba lagi.'], 422);
        }
        $user = User::find($entry['user_id']);
        if (!$user || $user->is_blocked) {
            return response()->json(['message' => 'Akun Anda diblokir. Hubungi admin Srawung.'], 403);
        }

        return response()->json(LoginSession::begin($user, $request, 'google', 'Login Google berhasil.'));
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

    /** Null bila email tersebut sudah terhubung dengan akun Google yang berbeda. */
    private function upsertGoogleUser(array $payload): ?User
    {
        $email = strtolower($payload['email']);
        $googleId = $payload['sub'];
        $avatar = $payload['picture'] ?? null;

        // ID Google dulu, baru email: email bisa berpindah tangan, ID tidak.
        $user = User::where('google_id', $googleId)->first() ?? User::where('email', $email)->first();

        if ($user) {
            if ($user->google_id && $user->google_id !== $googleId) {
                return null;
            }
            if (!$user->is_blocked && !$user->google_id) {
                // Akun dengan email yang belum pernah diverifikasi bisa saja dibuat orang lain memakai email
                // korban ("pre-hijacking"). Pemilik email yang asli baru saja membuktikan diri lewat Google,
                // jadi kata sandi & semua sesi lama dibuang.
                if (!$user->hasVerifiedEmail()) {
                    $user->forceFill(['password' => null, 'remember_token' => null, 'two_factor_secret' => null, 'two_factor_recovery' => null, 'two_factor_confirmed_at' => null])->save();
                    LoginSession::revokeAll($user);
                }
                SecurityLog::record('google.linked', $user);
            }
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
            'name' => SafeName::clean($payload['name'] ?? Str::before($email, '@')),
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
