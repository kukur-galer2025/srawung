<?php

namespace App\Providers;

use Illuminate\Http\Middleware\TrustProxies;
use Illuminate\Support\Facades\DB;
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
        }

        // Semua URL buatan Laravel (gambar, tautan) memakai https bila APP_URL https.
        if (str_starts_with((string) config('app.url'), 'https://')) {
            URL::forceScheme('https');
        }

        // Cegah migrate:fresh / db:wipe tak sengaja di server produksi.
        DB::prohibitDestructiveCommands($this->app->isProduction());
    }
}
