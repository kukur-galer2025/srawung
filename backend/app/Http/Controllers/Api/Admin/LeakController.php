<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AccessLog;
use App\Models\ReadingSession;
use App\Models\User;
use App\Services\ForensicMark;
use Illuminate\Http\Request;

/** Cocokkan kode watermark forensik dari tangkapan layar yang bocor dengan akun pembaca. */
class LeakController extends Controller
{
    public function lookup(Request $request)
    {
        $data = $request->validate(['code' => 'required|string|max:40']);
        $parsed = ForensicMark::parse($data['code']);
        if (!$parsed) {
            return response()->json(['message' => 'Format kode tidak dikenali. Contoh: AM7K-Q3X.'], 422);
        }

        $user = User::find($parsed['user_id']);
        if (!$user) {
            return response()->json(['message' => 'Tidak ada akun dengan kode ini. Periksa kembali huruf yang terbaca.'], 404);
        }

        $sessions = ReadingSession::with('book:id,title,slug')
            ->where('user_id', $user->id)
            ->latest('started_at')
            ->limit(15)
            ->get(['id', 'book_id', 'started_at', 'last_seen_at', 'ip_address', 'device', 'is_active']);

        return response()->json([
            'valid' => $parsed['valid'],
            'code' => ForensicMark::code($user),
            'user' => $user->only(['id', 'name', 'email', 'whatsapp', 'role', 'is_blocked', 'created_at']),
            'pages_opened_30d' => AccessLog::where('user_id', $user->id)->where('created_at', '>=', now()->subDays(30))->count(),
            'sessions' => $sessions,
        ]);
    }
}
