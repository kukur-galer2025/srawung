<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\NewOrderForAdmin;
use App\Services\OrderLifecycle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminNotificationTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_admin_is_emailed_for_every_new_order(): void
    {
        Notification::fake();
        $buyer = User::forceCreate([
            'name' => 'Pembeli', 'email' => 'pembeli@contoh.test', 'password' => 'password123',
            'role' => 'buyer', 'is_blocked' => false, 'email_verified_at' => now(),
        ]);
        Sanctum::actingAs($buyer);
        $this->postJson('/api/orders', ['book_ids' => [Book::where('status', 'published')->value('id')]])->assertCreated();

        $admin = User::where('role', 'admin')->value('email');
        Notification::assertSentOnDemand(NewOrderForAdmin::class, fn ($n, $c, AnonymousNotifiable $to) => $to->routes['mail'] === $admin);
    }

    public function test_admin_address_falls_back_to_admin_account_email(): void
    {
        Setting::set('admin_notification_email', null);
        $this->assertSame(User::where('role', 'admin')->value('email'), OrderLifecycle::adminEmail());

        Setting::set('admin_notification_email', 'kasir@contoh.test');
        $this->assertSame('kasir@contoh.test', OrderLifecycle::adminEmail());
    }
}
