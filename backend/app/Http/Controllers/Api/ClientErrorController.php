<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ErrorAlert;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * Menerima laporan error dari frontend (peramban & server Next.js) bila Sentry
 * belum dipasang. Dicatat ke log dan diteruskan ke email admin (lihat ErrorAlert).
 */
class ClientErrorController extends Controller
{
    /** Pola error yang bukan berasal dari kode Srawung (ekstensi peramban, dll.). */
    private const IGNORE = [
        'ResizeObserver loop',
        'Script error',
        'chrome-extension://',
        'moz-extension://',
        'safari-extension://',
        'Non-Error promise rejection',
        'Failed to fetch',          // jaringan pengunjung putus
        'Load failed',
        'NetworkError',
        'AbortError',
        'ChunkLoadError',           // versi lama di tab yang terbuka saat deploy
    ];

    public function store(Request $request)
    {
        $data = $request->validate([
            'message' => 'required|string|max:2000',
            'source' => 'nullable|in:browser,next-server',
            'url' => 'nullable|string|max:500',
            'stack' => 'nullable|string|max:4000',
            'digest' => 'nullable|string|max:100',
        ]);

        $haystack = $data['message'] . ' ' . ($data['stack'] ?? '');
        foreach (self::IGNORE as $pattern) {
            if (str_contains($haystack, $pattern)) {
                return response()->noContent();
            }
        }

        // Hanya path halaman (tanpa query string yang bisa memuat data pribadi).
        $path = $data['url'] ? (parse_url($data['url'], PHP_URL_PATH) ?: null) : null;
        $source = $data['source'] ?? 'browser';

        Log::warning("Frontend error ({$source}): " . Str::limit($data['message'], 500), [
            'path' => $path,
            'digest' => $data['digest'] ?? null,
            'stack' => isset($data['stack']) ? Str::limit($data['stack'], 2000) : null,
            'agent' => Str::limit((string) $request->userAgent(), 200),
        ]);

        ErrorAlert::reportClient(
            $source === 'next-server' ? 'server frontend' : 'peramban pengunjung',
            $data['message'],
            $path ? "halaman {$path}" : null,
        );

        return response()->noContent();
    }
}
