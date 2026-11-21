<?php

namespace Tests\Feature;

use App\Models\Banner;
use App\Models\Book;
use App\Models\Coupon;
use App\Models\Post;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Harga promo, kupon publik, banner iklan, dan blog.
 */
class StorefrontTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private Book $book;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->book = Book::where('status', 'published')->firstOrFail();
        $this->book->update(['price' => 100000]);
    }

    private function buyer(): User
    {
        return User::forceCreate([
            'name' => 'Pembeli Uji',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password123',
            'role' => 'buyer',
            'is_blocked' => false,
            'email_verified_at' => now(),
        ]);
    }

    private function admin(): User
    {
        return User::where('role', 'admin')->firstOrFail();
    }

    public function test_active_sale_price_is_charged_at_checkout(): void
    {
        $this->book->update(['sale_price' => 75000, 'sale_ends_at' => now()->addDay()]);
        Sanctum::actingAs($this->buyer());

        $res = $this->postJson('/api/orders', ['book_ids' => [$this->book->id]])->assertCreated();

        $order = $res->json('order');
        $this->assertSame(75000, (int) $order['order_items'][0]['price']);
        $this->assertSame(75000, (int) $order['total']);
    }

    public function test_expired_sale_falls_back_to_normal_price(): void
    {
        $this->book->forceFill(['sale_price' => 75000, 'sale_ends_at' => now()->subMinute()])->save();
        Sanctum::actingAs($this->buyer());

        $res = $this->postJson('/api/orders', ['book_ids' => [$this->book->id]])->assertCreated();

        $this->assertSame(100000, (int) $res->json('order.order_items.0.price'));
        $this->getJson("/api/books/{$this->book->slug}")
            ->assertJson(['is_on_sale' => false, 'effective_price' => 100000, 'sale_price' => null]);
    }

    public function test_catalog_filters_and_sorts_by_effective_price(): void
    {
        $this->book->update(['sale_price' => 1000, 'sale_ends_at' => null]);

        $this->getJson('/api/books?on_sale=1')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $this->book->id)
            ->assertJsonPath('data.0.discount_percent', 99)
            ->assertJsonMissingPath('data.0.source_file_path');

        $this->getJson('/api/books?sort=termurah')->assertJsonPath('data.0.id', $this->book->id);
        $this->getJson('/api/books?price_max=1000')->assertJsonCount(1, 'data');
    }

    public function test_admin_cannot_set_sale_price_above_normal_price(): void
    {
        Sanctum::actingAs($this->admin());

        $this->putJson("/api/admin/books/{$this->book->id}", [
            'title' => $this->book->title,
            'author' => $this->book->author,
            'synopsis' => $this->book->synopsis,
            'price' => 50000,
            'sale_price' => 60000,
            'status' => 'published',
        ])->assertStatus(422)->assertJsonValidationErrors('sale_price');
    }

    public function test_draft_books_are_not_publicly_visible(): void
    {
        $this->book->update(['status' => 'draft']);

        $this->getJson("/api/books/{$this->book->slug}")->assertNotFound();
    }

    public function test_promo_lists_only_public_valid_coupons(): void
    {
        Coupon::create(['code' => 'PUBLIK', 'type' => 'percent', 'value' => 5, 'is_public' => true]);
        Coupon::create(['code' => 'RAHASIA', 'type' => 'percent', 'value' => 50, 'is_public' => false]);
        Coupon::create(['code' => 'LEWAT', 'type' => 'percent', 'value' => 5, 'is_public' => true, 'expires_at' => now()->subDay()]);
        Coupon::create(['code' => 'HABIS', 'type' => 'percent', 'value' => 5, 'is_public' => true, 'quota' => 1, 'used_count' => 1]);

        $codes = collect($this->getJson('/api/promo')->assertOk()->json('coupons'))->pluck('code');

        $this->assertTrue($codes->contains('PUBLIK'));
        $this->assertFalse($codes->contains('RAHASIA'));
        $this->assertFalse($codes->contains('LEWAT'));
        $this->assertFalse($codes->contains('HABIS'));
    }

    public function test_banners_respect_active_flag_and_schedule(): void
    {
        Banner::create(['title' => 'Tayang', 'theme' => 'blue', 'is_active' => true]);
        Banner::create(['title' => 'Nonaktif', 'theme' => 'blue', 'is_active' => false]);
        Banner::create(['title' => 'Belum mulai', 'theme' => 'blue', 'starts_at' => now()->addDay()]);
        Banner::create(['title' => 'Selesai', 'theme' => 'blue', 'ends_at' => now()->subDay()]);

        $titles = collect($this->getJson('/api/banners')->assertOk()->json())->pluck('title');

        $this->assertSame(['Tayang'], $titles->all());
    }

    public function test_banner_link_rejects_unsafe_schemes(): void
    {
        Sanctum::actingAs($this->admin());

        $this->postJson('/api/admin/banners', ['title' => 'X', 'theme' => 'blue', 'link_url' => 'javascript:alert(1)'])
            ->assertStatus(422)->assertJsonValidationErrors('link_url');
        $this->postJson('/api/admin/banners', ['title' => 'X', 'theme' => 'blue', 'link_url' => '//evil.example'])
            ->assertStatus(422);
        $this->postJson('/api/admin/banners', ['title' => 'Promo', 'theme' => 'blue', 'link_url' => '/promo'])
            ->assertCreated();
    }

    public function test_blog_shows_only_published_posts_and_strips_raw_html(): void
    {
        Post::create([
            'title' => 'Terbit', 'slug' => 'terbit', 'body' => "## Judul\n\n<script>alert(1)</script>\n\n[x](javascript:alert(1))",
            'status' => 'published', 'published_at' => now()->subHour(),
        ]);
        Post::create(['title' => 'Draf', 'slug' => 'draf', 'body' => 'x', 'status' => 'draft']);
        Post::create(['title' => 'Terjadwal', 'slug' => 'terjadwal', 'body' => 'x', 'status' => 'published', 'published_at' => now()->addDay()]);

        $slugs = collect($this->getJson('/api/posts')->assertOk()->json('data'))->pluck('slug');
        $this->assertSame(['terbit'], $slugs->all());

        $html = $this->getJson('/api/posts/terbit')->assertOk()->json('body_html');
        $this->assertStringContainsString('<h2>Judul</h2>', $html);
        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('javascript:', $html);

        $this->getJson('/api/posts/draf')->assertNotFound();
        $this->getJson('/api/posts/terjadwal')->assertNotFound();
        $this->assertSame(1, Post::where('slug', 'terbit')->value('views'));
    }

    public function test_only_admin_can_manage_posts(): void
    {
        Sanctum::actingAs($this->buyer());
        $this->postJson('/api/admin/posts', ['title' => 'X', 'body' => 'x', 'status' => 'published'])->assertForbidden();

        Sanctum::actingAs($this->admin());
        $res = $this->postJson('/api/admin/posts', ['title' => 'Artikel Baru', 'body' => 'Isi', 'status' => 'published'])->assertCreated();
        $this->assertSame('artikel-baru', $res->json('post.slug'));
        $this->assertNotNull($res->json('post.published_at'));
    }
}
