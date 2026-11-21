<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lapisan kedua untuk akun yang diblokir/dihapus: walaupun token lama masih ada
 * (seharusnya sudah dicabut saat diblokir), semua request API-nya ditolak.
 */
class EnsureNotBlocked
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->bearerToken() ? $request->user('sanctum') : null;
        if ($user && $user->is_blocked) {
            $user->currentAccessToken()?->delete();

            return response()->json(['message' => 'Akun Anda diblokir. Hubungi admin Srawung.', 'code' => 'blocked'], 403);
        }

        return $next($request);
    }
}
