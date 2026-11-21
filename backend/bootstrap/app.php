<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // API memakai Bearer token (Sanctum personal access token) dari localStorage,
        // bukan cookie session. statefulApi() sengaja TIDAK diaktifkan karena akan
        // memaksa verifikasi CSRF (HTTP 419) pada setiap request dari localhost:3000.
        $middleware->alias([
            'admin' => \App\Http\Middleware\AdminMiddleware::class,
            'creator' => \App\Http\Middleware\CreatorMiddleware::class,
        ]);

        // Cek role SEBELUM route model binding: non-admin/non-kreator selalu mendapat 403,
        // tidak bisa menebak ID data mana yang ada lewat jawaban 404.
        // Urutan: akun diblokir → cek role → cari data.
        $middleware->prependToPriorityList(
            before: \Illuminate\Routing\Middleware\SubstituteBindings::class,
            prepend: \App\Http\Middleware\EnsureNotBlocked::class,
        );
        $middleware->prependToPriorityList(
            before: \Illuminate\Routing\Middleware\SubstituteBindings::class,
            prepend: \App\Http\Middleware\AdminMiddleware::class,
        );
        $middleware->prependToPriorityList(
            before: \Illuminate\Routing\Middleware\SubstituteBindings::class,
            prepend: \App\Http\Middleware\CreatorMiddleware::class,
        );

        $middleware->append(\App\Http\Middleware\SecurityHeaders::class);
        $middleware->api(append: [\App\Http\Middleware\EnsureNotBlocked::class]);

        // Tidak ada halaman login di backend: tamu di /api/* cukup mendapat 401 JSON,
        // bukan redirect ke rute "login" (yang tidak ada → error 500).
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : config('app.frontend_url') . '/masuk');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // Pemantauan error:
        //  - Sentry (stack trace, riwayat, jumlah pengguna terdampak) — aktif bila SENTRY_LARAVEL_DSN diisi.
        //  - Email ke admin (produksi) — langsung bekerja tanpa layanan luar; dibatasi agar tidak membanjiri.
        // Error 4xx (validasi, 404, belum login) tidak dilaporkan.
        \Sentry\Laravel\Integration::handles($exceptions);
        $exceptions->reportable(fn (\Throwable $e) => \App\Services\ErrorAlert::report($e));
    })->create();
