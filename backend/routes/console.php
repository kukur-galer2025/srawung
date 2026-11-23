<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * Penjadwal. Lokal: jendela "Scheduler" dari run-dev.bat (php artisan schedule:work).
 * Server:  * * * * * cd /path/ke/backend && php artisan schedule:run >> /dev/null 2>&1
 */
Schedule::command('amania:expire-orders')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('amania:payment-reminders')->everyFiveMinutes()->withoutOverlapping();
Schedule::command('amania:wishlist-sale-alerts')->everyThirtyMinutes()->withoutOverlapping();
Schedule::command('amania:cart-reminders')->everyThirtyMinutes()->withoutOverlapping();
// Pengingat "lanjutkan membaca": sekali sehari pukul 19.00 WIB (jam santai membaca).
Schedule::command('amania:reading-reminders')->dailyAt('19:00')->timezone('Asia/Jakarta')->withoutOverlapping();
// Log pencarian katalog hanya disimpan 180 hari.
// Log tanya-jawab Kanca disimpan 90 hari.
Schedule::call(fn () => \App\Models\AssistantMessage::where('created_at', '<', now()->subDays(90))->delete())->daily()->name('prune-assistant-log');
Schedule::call(fn () => \Illuminate\Support\Facades\DB::table('search_query_daily')->where('date', '<', now()->subDays(180)->toDateString())->delete())
    ->daily()
    ->name('prune-search-log');

// Buang token login kedaluwarsa & rapikan sesi baca lama.
Schedule::command('sanctum:prune-expired --hours=24')->daily();

// Pemantauan: email ke admin bila worker macet, disk hampir penuh, dll.
Schedule::command('amania:health-check --silent-ok')
    ->everyFiveMinutes()
    ->withoutOverlapping()
    ->environments(['production']); // lokal: cukup lihat panel Status sistem

// Detak jantung: dipakai halaman Pengaturan admin untuk menampilkan apakah scheduler hidup.
Schedule::call(fn () => Cache::put('heartbeat:scheduler', now()->toIso8601String(), now()->addDay()))
    ->everyMinute()
    ->name('heartbeat-scheduler');
