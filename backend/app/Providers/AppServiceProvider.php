<?php

namespace App\Providers;

use App\Support\SsrClient;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Di belakang Nginx/Cloudflare: percayai header X-Forwarded-* dari proxy yang
        // terdaftar agar IP pembaca (batas perangkat, log akses) dan HTTPS terbaca benar.
        if ($proxies = config('app.trusted_proxies')) {
            TrustProxies::at($proxies === '*' ? '*' : array_map('trim', explode(',', $proxies)));
            // Hanya IP & protokol: X-Forwarded-Host/Prefix dari klien tidak boleh memengaruhi URL buatan sistem.
            TrustProxies::withHeaders(Request::HEADER_X_FORWARDED_FOR | Request::HEADER_X_FORWARDED_PROTO);
        }

        // Batas dasar halaman publik. Server frontend (SSR) dikecualikan karena mewakili semua pengunjung.
        RateLimiter::for('public-read', fn (Request $r) => SsrClient::is($r->ip())
            ? Limit::none()
            : Limit::perMinute(240)->by('public-read|' . $r->ip()));

        // Semua URL buatan Laravel (gambar, tautan) memakai https bila APP_URL https.
        if (str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }

        // Cegah migrate:fresh / db:wipe tak sengaja di server produksi.
        DB::prohibitDestructiveCommands($this->app->isProduction());
    }
}
