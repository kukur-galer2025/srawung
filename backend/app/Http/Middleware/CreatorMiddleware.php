<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class CreatorMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        $user = $request->user();
        if (!$user || $user->role !== 'creator' || $user->is_blocked) {
            return response()->json(['message' => 'Halaman ini khusus kreator.'], 403);
        }

        return $next($request);
    }
}
