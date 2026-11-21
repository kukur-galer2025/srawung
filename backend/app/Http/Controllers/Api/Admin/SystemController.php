<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\PdfPageConverter;
use App\Services\SystemHealth;

/**
 * Ringkasan kesehatan proses latar belakang — supaya kegagalan tidak "diam-diam".
 */
class SystemController extends Controller
{
    public function status(PdfPageConverter $converter, SystemHealth $health)
    {
        $tool = $converter->detect();

        return response()->json([
            'pdf_converter' => [
                'ok' => $tool !== null,
                'engine' => $tool['engine'] ?? null,
            ],
            'queue' => $health->queue(),
            'scheduler' => $health->scheduler(),
            'disk' => $health->disk(),
            'production' => [
                'debug' => (bool) config('app.debug'),
                'env' => app()->environment(),
            ],
            'books_failed' => $health->booksFailed(),
        ]);
    }

    /**
     * GET /api/health — untuk monitor uptime luar (UptimeRobot, BetterStack, dll.).
     * 200 = sehat; 503 = ada komponen inti mati. Sengaja tidak memuat detail sensitif.
     */
    public function health(SystemHealth $health)
    {
        if (!$health->database()) {
            return response()->json(['status' => 'error', 'failing' => ['database']], 503);
        }

        $failing = [];
        if (!$health->scheduler()['ok']) {
            $failing[] = 'scheduler';
        }
        if ($health->queue()['oldest_waiting_seconds'] >= 600) {
            $failing[] = 'queue';
        }

        return response()
            ->json(['status' => $failing ? 'error' : 'ok', 'failing' => $failing], $failing ? 503 : 200)
            ->header('Cache-Control', 'no-store');
    }
}
