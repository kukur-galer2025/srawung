<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Bundle;
use App\Models\Cart;
use App\Models\NewsletterCampaign;
use App\Models\NewsletterSubscriber;
use App\Models\Order;
use App\Models\User;
use App\Models\UserLibrary;
use App\Notifications\AbandonedCartReminder;
use App\Notifications\NewsletterConfirm;
use App\Notifications\NewsletterIssue;
use App\Services\EmailPreferences;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Paket bundel, hadiah buku, pengingat keranjang, newsletter, zona waktu.
 */
class GrowthFeaturesTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function user(array $attrs = []): User
    {
        return User::forceCreate([
            'name' => 'Sari Wulandari',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password123',
            'role' => 'buyer',
            'is_blocked' => false,
            'email_verified_at' => now(),
            ...$attrs,
        ]);
    }

    private function admin(): User
    {
        return User::where('role', 'admin')->firstOrFail();
    }

    /** @return array{0: Bundle, 1: \Illuminate\Support\Collection<int, Book>} */
    private function bundle(int $books = 3): array
    {
        $list = Book::where('status', 'published')->orderBy('id')->take($books)->get();
        $individual = $list->sum(fn (Book $b) => $b->currentPrice());
        $bundle = Bundle::create(['title' => 'Paket Uji', 'slug' => 'paket-uji', 'price' => (int) round($individual * 0.6), 'is_active' => true]);
        $bundle->books()->sync($list->pluck('id')->values()->mapWithKeys(fn ($id, $i) => [$id => ['sort' => $i]])->all());

        return [$bundle->fresh(), $list];
    }

    private function confirm(Order $order): void
    {
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/admin/orders/{$order->id}/confirm")->assertOk();
    }

    /* ---------------- Zona waktu ---------------- */

    public function test_app_runs_in_jakarta_time_and_normalizes_utc_input(): void
    {
        $this->assertSame('Asia/Jakarta', config('app.timezone'));

        $book = Book::firstOrFail();
        // Admin di peramban mengirim ISO UTC: 03.00Z = 10.00 WIB.
        $book->update(['sale_ends_at' => '2026-12-01T03:00:00.000Z']);

        $this->assertSame('2026-12-01 10:00:00', $book->fresh()->getRawOriginal('sale_ends_at'));
        // API tetap mengirim momen absolut yang sama.
        $this->assertSame('2026-12-01T03:00:00.000000Z', $book->fresh()->toArray()['sale_ends_at']);
    }

    /* ---------------- Paket bundel ---------------- */

    public function test_bundle_price_is_allocated_per_book_and_owned_books_are_deducted(): void
    {
        [$bundle, $books] = $this->bundle();
        $user = $this->user();
        Sanctum::actingAs($user);

        $quote = $this->postJson('/api/cart/quote', ['bundle_ids' => [$bundle->id]])->assertOk()->json();
        $this->assertSame($bundle->price, $quote['subtotal']);

        // Sudah punya satu buku → bagiannya tidak ditagih lagi.
        UserLibrary::create(['user_id' => $user->id, 'book_id' => $books[0]->id, 'access_status' => 'active']);
        $quote = $this->postJson('/api/cart/quote', ['bundle_ids' => [$bundle->id], 'book_ids' => [$books[1]->id]])->assertOk()->json();
        $shares = $bundle->allocate($books);
        $this->assertSame($bundle->price - $shares[$books[0]->id], $quote['subtotal'], 'buku duplikat satuan tidak ditagih dua kali');
        $this->assertSame('owned', $quote['lines'][0]['books'][0]['state']);
        $this->assertFalse($quote['lines'][1]['available']);

        // Checkout: harga yang ditagih = harga quote, baris buku menyimpan bundle_id.
        $res = $this->postJson('/api/orders', ['bundle_ids' => [$bundle->id], 'book_ids' => [$books[1]->id]])->assertCreated();
        $order = Order::with('orderItems')->where('order_number', $res->json('order.order_number'))->first();
        $this->assertSame($quote['subtotal'], (int) $order->orderItems->sum('price'));
        $this->assertCount(2, $order->orderItems);
        $this->assertTrue($order->orderItems->every(fn ($i) => $i->bundle_id === $bundle->id));
    }

    public function test_admin_bundle_must_be_cheaper_than_individual_total(): void
    {
        Sanctum::actingAs($this->admin());
        $ids = Book::where('status', 'published')->take(2)->pluck('id')->all();
        $total = Book::whereIn('id', $ids)->get()->sum(fn ($b) => $b->currentPrice());

        $this->postJson('/api/admin/bundles', ['title' => 'Mahal', 'price' => $total, 'book_ids' => $ids])->assertStatus(422);
        $this->postJson('/api/admin/bundles', ['title' => 'Paket Hemat', 'price' => $total - 5000, 'book_ids' => $ids])->assertCreated();

        $this->getJson('/api/bundles')->assertOk()->assertJsonPath('0.slug', 'paket-hemat')->assertJsonPath('0.savings', 5000);
        $this->getJson('/api/books/' . Book::find($ids[0])->slug)->assertJsonPath('bundles.0.slug', 'paket-hemat');
    }

    /* ---------------- Pengingat keranjang ---------------- */

    public function test_abandoned_cart_reminders_are_sent_twice_then_stop(): void
    {
        $user = $this->user();
        $book = Book::where('status', 'published')->firstOrFail();
        Sanctum::actingAs($user);
        $this->putJson('/api/cart', ['book_ids' => [$book->id], 'bundle_ids' => []])->assertOk();

        $this->artisan('amania:cart-reminders');
        Notification::assertNothingSent();

        $this->travel(4)->hours();
        $this->artisan('amania:cart-reminders');
        $this->artisan('amania:cart-reminders');
        Notification::assertSentToTimes($user, AbandonedCartReminder::class, 1);

        $this->travel(2)->days();
        $this->artisan('amania:cart-reminders');
        Notification::assertSentToTimes($user, AbandonedCartReminder::class, 2);

        $this->travel(3)->days();
        $this->artisan('amania:cart-reminders');
        Notification::assertSentToTimes($user, AbandonedCartReminder::class, 2);

        // Sinkron ulang dengan isi sama tidak mereset; GET /cart mengembalikan isi keranjang.
        $this->putJson('/api/cart', ['book_ids' => [$book->id], 'bundle_ids' => []]);
        $this->assertSame(2, Cart::firstWhere('user_id', $user->id)->reminder_count);
        $this->getJson('/api/cart')->assertOk()->assertJsonPath('lines.0.id', $book->id);
    }

    public function test_no_cart_reminder_after_checkout_or_when_opted_out(): void
    {
        $user = $this->user();
        $book = Book::where('status', 'published')->firstOrFail();
        Sanctum::actingAs($user);
        $this->putJson('/api/cart', ['book_ids' => [$book->id], 'bundle_ids' => []]);
        $this->postJson('/api/orders', ['book_ids' => [$book->id]])->assertCreated();

        $other = $this->user();
        Sanctum::actingAs($other);
        $this->putJson('/api/cart', ['book_ids' => [$book->id], 'bundle_ids' => []]);
        $this->postJson('/api/email/reminders/unsubscribe', ['u' => $other->id, 't' => 'salah'])->assertNotFound();
        $this->postJson('/api/email/reminders/unsubscribe', ['u' => $other->id, 't' => EmailPreferences::reminderToken($other)])->assertOk();

        $this->travel(4)->hours();
        $this->artisan('amania:cart-reminders');
        Notification::assertNotSentTo([$user, $other], AbandonedCartReminder::class);
    }

    /* ---------------- Newsletter ---------------- */

    public function test_newsletter_double_opt_in_campaign_and_one_click_unsubscribe(): void
    {
        $this->postJson('/api/newsletter/subscribe', ['email' => 'Pembaca@Contoh.test'])->assertOk()->assertJsonPath('status', 'pending');
        $sub = NewsletterSubscriber::firstWhere('email', 'pembaca@contoh.test');
        Notification::assertSentOnDemand(NewsletterConfirm::class);

        $this->postJson('/api/newsletter/confirm', ['token' => $sub->token])->assertOk();
        $this->assertSame('subscribed', $sub->fresh()->status);

        // Pengguna terverifikasi yang login langsung berlangganan dari Profil.
        $user = $this->user();
        Sanctum::actingAs($user);
        $this->putJson('/api/profile/email-preferences', ['newsletter' => true])->assertOk()->assertJsonPath('newsletter', 'subscribed');

        Sanctum::actingAs($this->admin());
        $campaign = $this->postJson('/api/admin/newsletter/campaigns', [
            'subject' => 'Buku baru bulan ini',
            'body' => '<p>Halo!</p><script>alert(1)</script>',
        ])->assertCreated()->json('campaign');
        $this->assertStringNotContainsString('<script', NewsletterCampaign::find($campaign['id'])->body);

        $this->postJson("/api/admin/newsletter/campaigns/{$campaign['id']}/send")->assertOk();
        Notification::assertSentOnDemandTimes(NewsletterIssue::class, 2);
        $this->assertSame('sent', NewsletterCampaign::find($campaign['id'])->status);
        $this->postJson("/api/admin/newsletter/campaigns/{$campaign['id']}/send")->assertStatus(422);

        // One-click unsubscribe dari Gmail (RFC 8058).
        $this->postJson("/api/newsletter/unsubscribe/{$sub->token}")->assertOk();
        $this->assertSame('unsubscribed', $sub->fresh()->status);
    }

    public function test_account_deletion_removes_cart_and_newsletter(): void
    {
        $user = $this->user();
        Sanctum::actingAs($user);
        $book = Book::where('status', 'published')->firstOrFail();
        $this->putJson('/api/cart', ['book_ids' => [$book->id], 'bundle_ids' => []]);
        $this->putJson('/api/profile/email-preferences', ['newsletter' => true]);

        $this->assertSame(1, NewsletterSubscriber::count());

        $this->deleteJson('/api/profile', ['password' => 'password123'])->assertOk();
        $this->assertSame(0, Cart::where('user_id', $user->id)->count());
        $this->assertSame(0, NewsletterSubscriber::count());
    }
}
