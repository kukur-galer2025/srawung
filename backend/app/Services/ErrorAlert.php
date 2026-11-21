<?php

namespace App\Services;

use App\Notifications\SystemAlert;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Throwable;

/**
 * Email ke admin saat terjadi error tak tertangani — pemantauan error yang langsung
 * bekerja tanpa layanan luar. (Bila SENTRY_LARAVEL_DSN diisi, Sentry ikut mencatat
 * lengkap dengan stack trace; email ini tetap jadi alarm cepat.)
 *
 * Anti-banjir: error yang sama (kelas + file + baris) maksimal 1 email per jam,
 * dan maksimal 10 email error per jam secara keseluruhan.
 */
class ErrorAlert
{
    private static bool $sending = false;

    public static function report(Throwable $e): void
    {
        if (!app()->isProduction() || self::$sending) {
            return;
        }

        self::send(
            class_basename($e),
            Str::limit($e->getMessage() ?: '(tanpa pesan)', 300),
            self::location($e),
            md5(get_class($e) . '|' . $e->getFile() . '|' . $e->getLine()),
        );
    }

    /** Error dari peramban / server Next.js (lihat ClientErrorController). */
    public static function reportClient(string $source, string $message, ?string $where): void
    {
        if (!app()->isProduction() || self::$sending) {
            return;
        }

        self::send("Error di {$source}", Str::limit($message, 300), $where, md5($source . '|' . $message));
    }

    private static function send(string $what, string $message, ?string $where, string $fingerprint): void
    {
        if (!Cache::add("error-alert:{$fingerprint}", true, now()->addHour())) {
            return;
        }
        $hourKey = 'error-alert:count:' . now()->format('YmdH');
        Cache::add($hourKey, 0, now()->addHours(2));
        if (Cache::increment($hourKey) > 10) {
            return;
        }

        $email = OrderLifecycle::adminEmail();
        if (!$email) {
            return;
        }

        $request = app()->runningInConsole() ? null : request();
        $problems = array_filter([
            'error' => "{$what}: {$message}",
            'where' => $where ? "Lokasi: {$where}" : null,
            'request' => $request ? 'Permintaan: ' . $request->method() . ' /' . ltrim($request->path(), '/') . ($request->user() ? ' · pengguna #' . $request->user()->id : ' · tamu') : 'Proses latar (queue/scheduler)',
        ]);

        self::$sending = true;
        try {
            Notification::route('mail', $email)->notifyNow(new SystemAlert(
                'Error pada situs Srawung',
                $problems,
                'Error yang sama tidak dilaporkan lagi selama 1 jam. Detail lengkap ada di backend/storage/logs/' . (config('sentry.dsn') ? ' dan dasbor Sentry.' : '. Pasang Sentry (SENTRY_LARAVEL_DSN) untuk stack trace & riwayat.'),
            ));
        } catch (Throwable) {
            // Jangan sampai kegagalan email memicu error berantai.
        } finally {
            self::$sending = false;
        }
    }

    private static function location(Throwable $e): string
    {
        $file = str_replace([base_path() . DIRECTORY_SEPARATOR, '\\'], ['', '/'], $e->getFile());

        return "{$file}:{$e->getLine()}";
    }
}
