<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\UserLibrary;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function index(Request $request)
    {
        $query = User::withCount([
            'orders',
            'userLibraries',
            'readerFlags as flags_count' => fn ($q) => $q->where('created_at', '>=', now()->subDays(30)),
        ])->latest();

        if ($request->boolean('flagged')) {
            $query->whereHas('readerFlags', fn ($q) => $q->where('created_at', '>=', now()->subDays(30)));
        }

        if ($request->filled('role')) {
            $query->where('role', $request->role);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                  ->orWhere('email', 'like', "%{$search}%")
                  ->orWhere('whatsapp', 'like', "%{$search}%");
            });
        }

        $users = $query->paginate(20);
        return response()->json($users);
    }

    /** Rincian aktivitas baca mencurigakan + sesi aktif seorang pengguna. */
    public function activity($id)
    {
        $user = User::findOrFail($id);

        return response()->json([
            'flags' => $user->readerFlags()->with('book:id,title')->latest('created_at')->limit(50)->get(),
            'active_sessions' => \App\Models\ReadingSession::with('book:id,title')
                ->where('user_id', $user->id)->where('is_active', true)
                ->latest('started_at')->get(['id', 'book_id', 'started_at', 'last_seen_at', 'ip_address', 'device']),
            'pages_last_24h' => \App\Models\AccessLog::where('user_id', $user->id)->where('created_at', '>=', now()->subDay())->count(),
            'pages_last_hour' => \App\Models\AccessLog::where('user_id', $user->id)->where('created_at', '>=', now()->subHour())->count(),
        ]);
    }

    /** Akhiri semua sesi baca pengguna (mis. saat dicurigai berbagi akun). */
    public function endReadingSessions($id)
    {
        $count = \App\Models\ReadingSession::where('user_id', $id)->where('is_active', true)
            ->update(['is_active' => false, 'ended_reason' => 'admin']);

        return response()->json(['message' => "{$count} sesi baca diakhiri."]);
    }

    public function block($id)
    {
        $user = User::findOrFail($id);
        if ($user->role === 'admin') {
            return response()->json(['message' => 'Admin tidak dapat diblokir.'], 403);
        }

        $user->forceFill(['is_blocked' => true])->save();
        // Keluarkan semua sesi aktif pengguna yang diblokir.
        $user->tokens()->delete();

        return response()->json([
            'message' => 'Pengguna berhasil diblokir.',
            'user' => $user,
        ]);
    }

    public function unblock($id)
    {
        $user = User::findOrFail($id);
        $user->forceFill(['is_blocked' => false])->save();

        return response()->json([
            'message' => 'Blokir pengguna berhasil dibuka.',
            'user' => $user,
        ]);
    }

    public function revokeBook($userId, $bookId)
    {
        $library = UserLibrary::where('user_id', $userId)
            ->where('book_id', $bookId)
            ->firstOrFail();

        $library->update(['access_status' => 'revoked']);

        return response()->json([
            'message' => 'Akses buku untuk pengguna ini berhasil dicabut.',
            'library' => $library,
        ]);
    }
}
