<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Coupon;
use App\Models\CreatorPayout;
use App\Models\Order;
use App\Models\ReaderNote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route as RouteDef;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Batas hak akses antar role (tamu, pembeli, kreator, admin).
 *
 * Matriks di bawah memeriksa SETIAP route secara otomatis — route baru ikut teruji
 * tanpa perlu menulis test tambahan, dan test gagal bila ada route privat yang lupa
 * diberi middleware.
 */
class AccessControlTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    /** Route yang memang publik (etalase, autentikasi, tautan bertoken). Selain ini WAJIB login. */
    private const PUBLIC_ROUTES = [
        // Asisten Srawung: hanya membaca katalog publik, tanpa data akun.
        'api/assistant/chat', 'api/assistant/feedback', 'api/assistant/status',
        'api/auth/email/verify/{id}/{hash}', 'api/auth/forgot-password', 'api/auth/google', 'api/auth/google/callback',
        'api/auth/google/redirect', 'api/auth/login', 'api/auth/register', 'api/auth/reset-password',
        'api/banners', 'api/books', 'api/books/{slug}', 'api/books/{slug}/cart-event', 'api/books/{slug}/next', 'api/books/{slug}/report', 'api/books/{slug}/preview/{page}',
        'api/books/{slug}/reviews', 'api/books/{slug}/similar', 'api/books/{slug}/view', 'api/bundles', 'api/bundles/{slug}',
        'api/categories', 'api/client-errors', 'api/creator-terms', 'api/creators/{slug}', 'api/email/reminders/unsubscribe',
        'api/health', 'api/newsletter/confirm', 'api/newsletter/subscribe', 'api/newsletter/unsubscribe',
        'api/newsletter/unsubscribe/{token}', 'api/posts', 'api/posts/{slug}', 'api/promo', 'api/recommendations',
        'api/search/click', 'api/search/inside', 'api/search/suggest', 'api/trending',
        // Halaman buku memakai token sesi baca (dicek pemilik & perangkat di ReaderController).
        'api/reader/{bookSlug}/pages/{page}',
    ];

    private function user(string $role): User
    {
        return User::forceCreate([
            'name' => "Uji {$role}", 'email' => fake()->unique()->safeEmail(), 'password' => 'password123',
            'role' => $role, 'is_blocked' => false, 'email_verified_at' => now(),
        ]);
    }

    /** @return list<array{0: string, 1: string}> [method, url] untuk route yang URI-nya diawali $prefix */
    private function routes(string $prefix): array
    {
        $out = [];
        foreach (Route::getRoutes() as $route) {
            /** @var RouteDef $route */
            if (!str_starts_with($route->uri(), $prefix)) {
                continue;
            }
            $url = '/' . preg_replace('/\{[^}]+\}/', '1', $route->uri());
            foreach (array_diff($route->methods(), ['HEAD']) as $method) {
                $out[] = [$method, $url];
            }
        }

        return $out;
    }

    private function assertStatusFor(?User $as, array $routes, int $expected, string $who): void
    {
        foreach ($routes as [$method, $url]) {
            $this->app['auth']->forgetGuards();
            if ($as) {
                Sanctum::actingAs($as);
            }
            $status = $this->json($method, $url)->getStatusCode();
            $this->assertSame($expected, $status, "{$who} → {$method} {$url} seharusnya {$expected}, dapat {$status}");
        }
    }

    public function test_every_private_route_requires_login(): void
    {
        $unprotected = [];
        foreach (Route::getRoutes() as $route) {
            $uri = $route->uri();
            if (!str_starts_with($uri, 'api/') || in_array($uri, self::PUBLIC_ROUTES, true)) {
                continue;
            }
            $mw = implode(',', $route->gatherMiddleware());
            if (!str_contains($mw, 'auth:sanctum')) {
                $unprotected[] = implode('|', $route->methods()) . ' ' . $uri;
            }
        }
        $this->assertSame([], $unprotected, 'Route privat tanpa auth:sanctum ditemukan');
    }

    public function test_admin_routes_reject_guest_buyer_and_creator(): void
    {
        $routes = $this->routes('api/admin');
        $this->assertGreaterThan(50, count($routes));

        $this->assertStatusFor(null, $routes, 401, 'tamu');
        $this->assertStatusFor($this->user('buyer'), $routes, 403, 'pembeli');
        $this->assertStatusFor($this->user('creator'), $routes, 403, 'kreator');
    }

    public function test_creator_routes_reject_guest_buyer_and_admin(): void
    {
        $routes = $this->routes('api/creator/');
        $this->assertGreaterThan(10, count($routes));

        $this->assertStatusFor(null, $routes, 401, 'tamu');
        $this->assertStatusFor($this->user('buyer'), $routes, 403, 'pembeli');
        $this->assertStatusFor(User::where('role', 'admin')->first(), $routes, 403, 'admin');
    }

    public function test_users_cannot_escalate_their_own_role(): void
    {
        $buyer = $this->user('buyer');
        Sanctum::actingAs($buyer);
        $this->putJson('/api/profile', ['name' => 'Budi', 'whatsapp' => '081234567890', 'role' => 'admin', 'is_blocked' => false])->assertOk();
        $this->assertSame('buyer', $buyer->fresh()->role);

        $this->app['auth']->forgetGuards();
        $res = $this->postJson('/api/auth/register', [
            'name' => 'Penyusup', 'email' => 'penyusup@contoh.test', 'whatsapp' => '081299998888',
            'password' => 'rahasia123', 'password_confirmation' => 'rahasia123', 'role' => 'admin',
        ])->assertCreated();
        $this->assertSame('buyer', User::where('email', 'penyusup@contoh.test')->value('role'));
        $this->assertSame('buyer', $res->json('user.role'));

        // Kreator pun tidak bisa menjadikan dirinya admin atau mengubah komisinya sendiri.
        $creator = $this->user('creator');
        Sanctum::actingAs($creator);
        $this->putJson('/api/creator/profile', ['display_name' => 'Rina', 'commission_percent' => 0])->assertOk();
        $this->assertNull($creator->fresh()->creatorProfile->commission_percent);
        $this->patchJson("/api/admin/users/{$creator->id}/creator", ['enabled' => true])->assertForbidden();
    }

    public function test_data_is_isolated_between_users_and_creators(): void
    {
        $alice = $this->user('buyer');
        $bob = $this->user('buyer');
        $book = Book::where('status', 'published')->firstOrFail();

        // Pesanan Alice tidak bisa dibuka/diunduh Bob.
        Sanctum::actingAs($alice);
        $order = Order::find($this->postJson('/api/orders', ['book_ids' => [$book->id]])->assertCreated()->json('order.id'));
        Sanctum::actingAs($bob);
        $this->getJson("/api/orders/{$order->order_number}")->assertNotFound();
        $this->getJson("/api/orders/{$order->order_number}/invoice")->assertNotFound();
        $this->postJson("/api/orders/{$order->id}/proof", [])->assertStatus(422); // validasi dulu…
        $this->getJson('/api/orders')->assertJsonCount(0, 'data');

        // Catatan baca Alice tidak bisa diubah/dihapus Bob.
        \App\Models\UserLibrary::create(['user_id' => $alice->id, 'book_id' => $book->id, 'access_status' => 'active']);
        \App\Models\UserLibrary::create(['user_id' => $bob->id, 'book_id' => $book->id, 'access_status' => 'active']);
        $note = ReaderNote::create(['user_id' => $alice->id, 'book_id' => $book->id, 'page_number' => 1, 'body' => 'rahasia', 'color' => 'yellow']);
        $this->putJson("/api/reader/{$book->slug}/notes/{$note->id}", ['body' => 'diubah'])->assertNotFound();
        $this->deleteJson("/api/reader/{$book->slug}/notes/{$note->id}")->assertNotFound();
        $this->assertSame('rahasia', $note->fresh()->body);

        // Kreator A tidak bisa menyentuh buku, voucher, atau penarikan kreator B.
        $ca = $this->user('creator');
        $cb = $this->user('creator');
        $bookB = Book::create(['creator_id' => $cb->id, 'title' => 'Milik B', 'slug' => 'milik-b', 'author' => 'B', 'synopsis' => 'x', 'price' => 50000, 'status' => 'published']);
        $couponB = Coupon::create(['creator_id' => $cb->id, 'code' => 'MILIKB', 'type' => 'percent', 'value' => 10]);
        $payoutB = CreatorPayout::create(['creator_id' => $cb->id, 'amount' => 50000, 'status' => 'requested', 'payout_method' => 'bank', 'payout_provider' => 'BCA', 'payout_account' => '1', 'payout_holder' => 'B']);
        Sanctum::actingAs($ca);
        $this->getJson("/api/creator/books/{$bookB->id}")->assertNotFound();
        $this->postJson("/api/creator/books/{$bookB->id}/upload", [])->assertStatus(422);
        $this->putJson("/api/creator/coupons/{$couponB->id}", ['code' => 'CURI', 'type' => 'percent', 'value' => 90])->assertNotFound();
        $this->deleteJson("/api/creator/coupons/{$couponB->id}")->assertNotFound();
        $this->getJson('/api/creator/books')->assertJsonCount(0, 'data');
        $this->getJson('/api/creator/coupons')->assertJsonCount(0);
        $this->assertNotContains($payoutB->id, array_column($this->getJson('/api/creator/payouts')->json('data'), 'id'));
        $this->assertSame('MILIKB', $couponB->fresh()->code);

        // Kreator tidak bisa menjadikan buku Srawung sebagai miliknya lewat create.
        \App\Models\CreatorProfile::create(['user_id' => $ca->id, 'display_name' => 'Kreator A', 'terms_version' => \App\Services\CreatorTerms::VERSION, 'terms_accepted_at' => now()]);
        $id = $this->postJson('/api/creator/books', ['title' => 'Baru', 'author' => 'A', 'synopsis' => 'x', 'price' => 1000, 'status' => 'draft', 'creator_id' => $cb->id])
            ->assertCreated()->json('book.id');
        $this->assertSame($ca->id, Book::find($id)->creator_id);
    }

    public function test_blocked_user_token_is_rejected_everywhere(): void
    {
        $user = $this->user('creator');
        $token = $user->createToken('t')->plainTextToken;
        $user->forceFill(['is_blocked' => true])->save();

        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/creator/summary')->assertForbidden()->assertJsonPath('code', 'blocked');
        $this->assertSame(0, $user->tokens()->count(), 'token akun diblokir langsung dicabut');

        // Setelah dicabut, token lama tidak berlaku lagi di mana pun.
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/auth/me')->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->withHeader('Authorization', "Bearer {$token}")->getJson('/api/orders')->assertUnauthorized();
    }
}
