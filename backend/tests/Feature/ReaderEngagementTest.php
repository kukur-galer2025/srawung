<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\ReaderController;
use App\Models\Book;
use App\Models\BookPage;
use App\Models\Order;
use App\Models\ReaderFlag;
use App\Models\ReadingSession;
use App\Models\Review;
use App\Models\User;
use App\Models\UserLibrary;
use App\Models\Wishlist;
use App\Notifications\WishlistOnSale;
use App\Services\BookTextIndexer;
use App\Services\ForensicMark;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Reader (daftar isi, pencarian, penanda, catatan), proteksi konten, ulasan, wishlist,
 * verifikasi email saat checkout, hapus/ekspor akun, dan sumber pesanan.
 */
class ReaderEngagementTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private Book $book;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        $this->book = Book::where('status', 'published')->firstOrFail();
    }

    private function user(bool $verified = true, array $attrs = []): User
    {
        return User::forceCreate([
            'name' => 'Budi Santoso',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password123',
            'role' => 'buyer',
            'is_blocked' => false,
            'email_verified_at' => $verified ? now() : null,
            ...$attrs,
        ]);
    }

    private function owner(): User
    {
        $u = $this->user();
        UserLibrary::create(['user_id' => $u->id, 'book_id' => $this->book->id, 'access_status' => 'active']);

        return $u;
    }

    /* ---------------- Daftar isi & pencarian ---------------- */

    public function test_toc_parser_reads_printed_table_of_contents(): void
    {
        $pages = array_fill(0, 40, 'isi halaman');
        $pages[2] = "AMANIA PRESS                 D A F TA R I S I\nDaftar Isi\nKata Pengantar                         5\nBAGIAN I · FONDASI\n1    Mengenal Laravel                  10\n     Mengapa Laravel?                  11\n2    Instalasi                         20\n     Membuat Proyek                    22\n";
        $pages[3] = "Lihat Daftar Isi di depan.";
        $pages[9] = 'BAGIAN I · BAB 1 Mengenal Laravel pembuka';
        $pages[19] = 'BAGIAN I · BAB 2 Instalasi pembuka';

        $toc = app(BookTextIndexer::class)->buildToc($pages, 40);
        $byTitle = collect($toc)->keyBy('title');

        $this->assertSame(10, $byTitle['Mengenal Laravel']['page']);
        $this->assertSame('1', $byTitle['Mengenal Laravel']['number']);
        $this->assertSame(2, $byTitle['Mengapa Laravel?']['level']);
        $this->assertSame(0, $byTitle['Bagian I · Fondasi']['level']);
        $this->assertSame(10, $byTitle['Bagian I · Fondasi']['page'], 'Judul bagian menunjuk ke bab pertamanya.');
    }

    public function test_only_owners_can_search_and_snippets_never_expose_full_text(): void
    {
        BookPage::where('book_id', $this->book->id)->where('page_number', 3)->update(['text' => str_repeat('lorem ', 80) . 'Eloquent ORM memudahkan query' . str_repeat(' ipsum', 80)]);

        Sanctum::actingAs($this->user());
        $this->getJson("/api/reader/{$this->book->slug}/search?q=eloquent")->assertForbidden();

        Sanctum::actingAs($this->owner());
        $res = $this->getJson("/api/reader/{$this->book->slug}/search?q=eloquent")->assertOk();
        $this->assertSame(3, $res->json('results.0.page'));
        $this->assertLessThan(220, mb_strlen($res->json('results.0.snippet')));

        // Teks halaman tidak pernah ikut di API publik.
        $this->assertStringNotContainsString('Eloquent ORM memudahkan', $this->getJson("/api/books/{$this->book->slug}")->getContent());
    }

    public function test_bookmarks_and_notes_belong_to_their_owner(): void
    {
        $owner = $this->owner();
        Sanctum::actingAs($owner);
        $slug = $this->book->slug;

        $bm = $this->postJson("/api/reader/{$slug}/bookmarks", ['page_number' => 4, 'label' => 'Penting'])->assertCreated()->json('id');
        $this->postJson("/api/reader/{$slug}/bookmarks", ['page_number' => 4])->assertCreated(); // idempoten per halaman
        $this->assertCount(1, $this->getJson("/api/reader/{$slug}/bookmarks")->json());
        $this->postJson("/api/reader/{$slug}/bookmarks", ['page_number' => 9999])->assertStatus(422);

        $note = $this->postJson("/api/reader/{$slug}/notes", ['page_number' => 2, 'body' => 'Catatan saya', 'color' => 'blue'])->assertCreated()->json('id');
        $this->putJson("/api/reader/{$slug}/notes/{$note}", ['page_number' => 2, 'body' => 'Diubah'])->assertOk()->assertJsonPath('body', 'Diubah');

        // Pengguna lain (meski pemilik buku juga) tidak bisa menyentuh milik orang lain.
        Sanctum::actingAs($this->owner());
        $this->deleteJson("/api/reader/{$slug}/notes/{$note}")->assertNotFound();
        $this->deleteJson("/api/reader/{$slug}/bookmarks/{$bm}")->assertNotFound();
        $this->assertCount(0, $this->getJson("/api/reader/{$slug}/notes")->json());
    }

    /* ---------------- Proteksi konten ---------------- */

    public function test_many_devices_can_read_and_tokens_are_bound_to_their_device(): void
    {
        $owner = $this->owner();
        Sanctum::actingAs($owner);
        $open = fn (string $device) => $this->postJson("/api/reader/{$this->book->slug}/session", [], ['X-Reader-Device' => $device])->assertOk()->json('session_token');
        $page = fn (string $token, string $device) => $this->get("/api/reader/{$this->book->slug}/pages/1", ['Authorization' => "Bearer {$token}", 'X-Reader-Device' => $device]);

        // Perangkat yang sama boleh membuka beberapa tab.
        $hpA = $open('perangkat-hp-aaaaaaaaaa');
        $open('perangkat-hp-aaaaaaaaaa');
        $laptop = $open('perangkat-laptop-bbbbbbbb');
        $this->travel(1)->minutes();
        $this->app['auth']->forgetGuards();
        Sanctum::actingAs($owner);
        $page($laptop, 'perangkat-laptop-bbbbbbbb')->assertOk();

        // Tanpa batas perangkat: perangkat ketiga pun tetap bisa membaca bersamaan.
        $hpC = $open('perangkat-hp-cccccccccc');
        $this->flushHeaders();
        $page($hpA, 'perangkat-hp-aaaaaaaaaa')->assertOk();
        $page($laptop, 'perangkat-laptop-bbbbbbbb')->assertOk();
        $page($hpC, 'perangkat-hp-cccccccccc')->assertOk();

        // Token yang disalin ke perangkat lain tidak berlaku.
        $page($hpC, 'perangkat-pencuri-dddddddd')->assertStatus(401)->assertJsonPath('code', 'session_invalid');
    }

    public function test_forensic_code_roundtrip_and_admin_lookup(): void
    {
        $owner = $this->owner();
        $code = ForensicMark::code($owner);
        $this->assertMatchesRegularExpression('/^AM[2-9A-HJKMNP-Z]+-[2-9A-HJKMNP-Z]{3}$/', $code);
        $this->assertSame(['user_id' => $owner->id, 'valid' => true], ForensicMark::parse(strtolower(str_replace('-', ' ', $code))));
        $this->assertFalse(ForensicMark::parse(substr($code, 0, -1) . (str_ends_with($code, 'Z') ? 'Y' : 'Z'))['valid'], 'kode cek palsu terdeteksi');
        $this->assertNull(ForensicMark::parse('bukan-kode'));

        // Hanya admin yang boleh melacak.
        Sanctum::actingAs($owner);
        $this->getJson('/api/admin/leaks/lookup?code=' . urlencode($code))->assertForbidden();
        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());
        $this->getJson('/api/admin/leaks/lookup?code=' . urlencode($code))
            ->assertOk()->assertJsonPath('user.email', $owner->email)->assertJsonPath('valid', true);
    }

    public function test_forensic_mark_is_stamped_without_breaking_the_page(): void
    {
        $img = imagecreatetruecolor(1200, 1600);
        imagefill($img, 0, 0, imagecolorallocate($img, 255, 255, 255));
        ForensicMark::apply($img, $this->owner());

        // Ada piksel yang sedikit lebih gelap (kode), tapi tidak ada yang mencolok.
        $min = 255;
        for ($y = 0; $y < 400; $y += 2) {
            for ($x = 0; $x < 1200; $x += 2) {
                $min = min($min, imagecolorat($img, $x, $y) & 0xFF);
            }
        }
        $this->assertLessThan(255, $min);
        $this->assertGreaterThan(235, $min);
    }

    public function test_page_fetching_is_rate_limited_and_flagged(): void
    {
        Storage::fake('local');
        $owner = $this->owner();
        Sanctum::actingAs($owner);
        $token = $this->postJson("/api/reader/{$this->book->slug}/session")->json('session_token');

        [$perMinute] = ReaderController::RATE_LIMITS['menit'];
        for ($i = 0; $i < $perMinute; $i++) {
            $this->get("/api/reader/{$this->book->slug}/pages/1", ['Authorization' => "Bearer {$token}"]);
        }

        $this->getJson("/api/reader/{$this->book->slug}/pages/1", ['Authorization' => "Bearer {$token}"])
            ->assertStatus(429)->assertJson(['code' => 'rate_limited']);
        $this->getJson("/api/reader/{$this->book->slug}/pages/1", ['Authorization' => "Bearer {$token}"])->assertStatus(429);

        $this->assertSame(1, ReaderFlag::where('user_id', $owner->id)->count(), 'Satu catatan per jendela waktu, tidak berulang.');

        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());
        $this->getJson('/api/admin/users?flagged=1')->assertOk()->assertJsonPath('data.0.id', $owner->id)->assertJsonPath('data.0.flags_count', 1);
    }

    /* ---------------- Ulasan ---------------- */

    public function test_only_owners_can_review_and_rating_is_aggregated(): void
    {
        Sanctum::actingAs($this->user());
        $this->postJson("/api/books/{$this->book->slug}/reviews", ['rating' => 5])->assertForbidden();

        Sanctum::actingAs($this->owner());
        $this->postJson("/api/books/{$this->book->slug}/reviews", ['rating' => 5, 'title' => 'Mantap', 'body' => 'Jelas sekali'])->assertCreated();
        $this->postJson("/api/books/{$this->book->slug}/reviews", ['rating' => 4])->assertOk(); // ubah, bukan tambah

        Sanctum::actingAs($this->owner());
        $this->postJson("/api/books/{$this->book->slug}/reviews", ['rating' => 2])->assertCreated();

        $this->book->refresh();
        $this->assertSame(2, $this->book->rating_count);
        $this->assertEqualsWithDelta(3.0, $this->book->rating_avg, 0.001);

        $res = $this->getJson("/api/books/{$this->book->slug}/reviews")->assertOk();
        $this->assertSame('Budi S.', $res->json('data.0.author'), 'Nama pengulas disingkat demi privasi.');
        $this->assertSame(1, $res->json('summary.distribution.4'));

        // Admin menyembunyikan → tidak dihitung & tidak tampil.
        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());
        $id = Review::where('rating', 2)->value('id');
        $this->patchJson("/api/admin/reviews/{$id}/hide", ['reason' => 'Spam'])->assertOk();
        $this->assertSame(1, $this->book->fresh()->rating_count);
        $this->assertSame(1, $this->getJson("/api/books/{$this->book->slug}/reviews")->json('total'));
    }

    /* ---------------- Wishlist ---------------- */

    public function test_wishlist_sends_one_sale_email_per_promotion(): void
    {
        $user = $this->user();
        Sanctum::actingAs($user);
        $this->postJson("/api/wishlist/{$this->book->id}")->assertCreated();
        $this->assertSame([$this->book->id], $this->getJson('/api/wishlist/ids')->json());

        $this->artisan('amania:wishlist-sale-alerts')->assertSuccessful();
        Notification::assertNothingSent();

        $this->book->update(['sale_price' => (int) ($this->book->price / 2), 'sale_ends_at' => now()->addDays(3)]);
        $this->artisan('amania:wishlist-sale-alerts')->assertSuccessful();
        $this->artisan('amania:wishlist-sale-alerts')->assertSuccessful();

        Notification::assertSentToTimes($user, WishlistOnSale::class, 1);
        $this->assertNotNull(Wishlist::first()->notified_at);

        // Promo baru (harga berbeda) → diberi tahu lagi.
        $this->book->update(['sale_price' => (int) ($this->book->price / 3)]);
        $this->artisan('amania:wishlist-sale-alerts')->assertSuccessful();
        Notification::assertSentToTimes($user, WishlistOnSale::class, 2);
    }

    /* ---------------- Verifikasi email & sumber pesanan ---------------- */

    public function test_checkout_requires_verified_email_and_records_source(): void
    {
        Sanctum::actingAs($this->user(verified: false));
        $this->postJson('/api/orders', ['book_ids' => [$this->book->id]])->assertForbidden()->assertJson(['code' => 'email_unverified']);

        Sanctum::actingAs($this->user());
        $number = $this->postJson('/api/orders', [
            'book_ids' => [$this->book->id],
            'attribution' => [
                'utm_source' => 'Instagram', 'utm_medium' => 'social', 'utm_campaign' => 'promo-november',
                'referrer' => 'https://www.instagram.com/p/xyz?igsh=rahasia', 'landing_page' => 'https://amania.id/buku/x?utm_source=instagram&email=a@b.c',
            ],
        ])->assertCreated()->json('order.order_number');

        $order = Order::where('order_number', $number)->first();
        $this->assertSame('instagram', $order->utm_source);
        $this->assertSame('instagram.com', $order->referrer, 'Hanya domain, tanpa path/query.');
        $this->assertSame('/buku/x', $order->landing_page, 'Hanya path, tanpa query.');
    }

    public function test_unverified_user_can_fix_a_mistyped_email(): void
    {
        $user = $this->user(verified: false);
        Sanctum::actingAs($user);

        $this->putJson('/api/profile', ['name' => 'Budi', 'whatsapp' => '081234567890', 'email' => 'benar@contoh.id'])
            ->assertStatus(422)->assertJsonValidationErrors('current_password');

        $this->putJson('/api/profile', ['name' => 'Budi', 'whatsapp' => '081234567890', 'email' => 'benar@contoh.id', 'current_password' => 'password123'])
            ->assertOk()->assertJson(['email_changed' => true]);
        $this->assertSame('benar@contoh.id', $user->fresh()->email);
        $this->assertNull($user->fresh()->email_verified_at);
    }

    /* ---------------- Hak data pribadi ---------------- */

    public function test_user_can_delete_account(): void
    {
        $user = $this->owner();
        Review::create(['book_id' => $this->book->id, 'user_id' => $user->id, 'rating' => 5]);
        $this->book->refreshRating();
        Sanctum::actingAs($user);

        $this->deleteJson('/api/profile', ['password' => 'salah'])->assertStatus(422);
        $this->deleteJson('/api/profile', ['password' => 'password123'])->assertOk();

        $fresh = $user->fresh();
        $this->assertNotNull($fresh->anonymized_at);
        $this->assertTrue($fresh->is_blocked);
        $this->assertStringEndsWith('@amania.invalid', $fresh->email);
        $this->assertSame('Pengguna terhapus', $fresh->name);
        $this->assertSame(0, UserLibrary::where('user_id', $user->id)->count());
        $this->assertSame(0, $this->book->fresh()->rating_count, 'Rating dihitung ulang setelah ulasan ikut terhapus.');
        $this->assertSame(0, $fresh->tokens()->count());
    }

    public function test_account_deletion_waits_for_payment_under_verification(): void
    {
        $user = $this->user();
        Order::create(['order_number' => 'AMN-TEST-1', 'user_id' => $user->id, 'total' => 10000, 'status' => 'menunggu_verifikasi', 'payment_deadline' => now()->addDay()]);
        Sanctum::actingAs($user);

        $this->deleteJson('/api/profile', ['password' => 'password123'])->assertStatus(422);
        $this->assertNull($user->fresh()->anonymized_at);
    }
}
