<?php

namespace Tests\Feature;

use App\Models\Setting;
use App\Models\User;
use App\Notifications\SystemAlert;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Tests\TestCase;

class OperationsTest extends TestCase
{
    use RefreshDatabase;

    private function stuckJob(): void
    {
        DB::table('jobs')->insert([
            'queue' => 'default', 'payload' => '{}', 'attempts' => 0,
            'available_at' => now()->subMinutes(15)->timestamp, 'created_at' => now()->subMinutes(15)->timestamp,
        ]);
    }

    public function test_health_endpoint_reports_scheduler_and_queue(): void
    {
        $this->getJson('/api/health')->assertStatus(503)->assertJson(['failing' => ['scheduler']]);

        Cache::put('heartbeat:scheduler', now()->toIso8601String(), 600);
        $this->getJson('/api/health')->assertOk()->assertJson(['status' => 'ok', 'failing' => []]);

        $this->stuckJob();
        $this->getJson('/api/health')->assertStatus(503)->assertJson(['failing' => ['queue']]);
    }

    public function test_health_check_alerts_admin_once_then_reports_recovery(): void
    {
        Notification::fake();
        Setting::set('admin_notification_email', 'ops@contoh.test');

        // Antrean macet > 10 menit → satu email, tidak diulang.
        $this->stuckJob();
        $this->artisan('amania:health-check')->assertFailed();
        $this->artisan('amania:health-check')->assertFailed();
        Notification::assertSentOnDemandTimes(SystemAlert::class, 1);
        Notification::assertSentOnDemand(SystemAlert::class, function (SystemAlert $n, array $channels, AnonymousNotifiable $to) {
            return $to->routes['mail'] === 'ops@contoh.test' && isset($n->problems['queue']);
        });

        DB::table('jobs')->delete();
        $this->artisan('amania:health-check')->assertSuccessful();
        Notification::assertSentOnDemand(SystemAlert::class, fn (SystemAlert $n) => $n->title === 'Sistem kembali normal');
    }

    public function test_admin_system_status(): void
    {
        $admin = User::factory()->create(['role' => 'admin']);

        $this->actingAs($admin)->getJson('/api/admin/system-status')
            ->assertOk()
            ->assertJsonMissingPath('backup')
            ->assertJsonStructure(['queue', 'scheduler', 'disk', 'production' => ['debug', 'env']]);
    }

    public function test_api_sends_security_headers(): void
    {
        $this->getJson('/api/categories')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('X-Frame-Options', 'DENY');
    }
}
