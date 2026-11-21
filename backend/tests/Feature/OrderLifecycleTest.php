<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Kedaluwarsa pesanan, kuota kupon, dan keunikan nominal transfer.
 */
class OrderLifecycleTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private Book $book;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Storage::fake('local');
        $this->book = Book::where('status', 'published')->firstOrFail();
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

    private function checkout(User $user, ?string $coupon = null)
    {
        Sanctum::actingAs($user);

        return $this->postJson('/api/orders', array_filter([
            'book_ids' => [$this->book->id],
            'coupon_code' => $coupon,
        ]));
    }

    private function uploadProof(User $user, Order $order)
    {
        Sanctum::actingAs($user);

        return $this->post("/api/orders/{$order->id}/proof", [
            'proof' => UploadedFile::fake()->image('bukti.jpg'),
        ], ['Accept' => 'application/json']);
    }

    // ---------------------------------------------------------------- tanpa kode unik

    public function test_total_is_exactly_the_book_price_without_unique_code(): void
    {
        $res = $this->checkout($this->buyer())->assertCreated();
        $this->assertSame($this->book->currentPrice(), (int) $res->json('order.total'));
        $this->assertArrayNotHasKey('unique_code', $res->json('order'));

        // Dua pesanan dengan harga sama boleh bernominal sama (dicocokkan lewat bukti per pesanan).
        $second = $this->checkout($this->buyer())->assertCreated();
        $this->assertSame((int) $res->json('order.total'), (int) $second->json('order.total'));
    }

    public function test_free_order_is_confirmed_immediately(): void
    {
        $this->book->update(['price' => 0, 'sale_price' => null, 'sale_ends_at' => null]);
        $buyer = $this->buyer();

        $res = $this->checkout($buyer)->assertCreated();
        $this->assertSame(0, (int) $res->json('order.total'));
        $this->assertSame('dikonfirmasi', $res->json('order.status'));
        $this->assertTrue(\App\Models\UserLibrary::where('user_id', $buyer->id)->where('book_id', $this->book->id)->exists());
    }

    // ---------------------------------------------------------------- nomor 2

    public function test_unpaid_order_expires_after_deadline(): void
    {
        $order = $this->checkout($this->buyer())->assertCreated()->json('order');

        $this->artisan('amania:expire-orders');
        $this->assertSame('menunggu_pembayaran', Order::find($order['id'])->status, 'Belum lewat batas waktu.');

        $this->travel(25)->hours();
        $this->artisan('amania:expire-orders');

        $fresh = Order::find($order['id']);
        $this->assertSame('kedaluwarsa', $fresh->status);
        $this->assertDatabaseHas('order_status_logs', [
            'order_id' => $fresh->id,
            'from_status' => 'menunggu_pembayaran',
            'to_status' => 'kedaluwarsa',
        ]);
    }

    public function test_status_is_correct_even_when_scheduler_is_not_running(): void
    {
        $buyer = $this->buyer();
        $order = $this->checkout($buyer)->assertCreated()->json('order');

        $this->travel(25)->hours(); // scheduler TIDAK dijalankan

        Sanctum::actingAs($buyer);
        $this->getJson("/api/orders/{$order['order_number']}")
            ->assertOk()
            ->assertJsonPath('order.status', 'kedaluwarsa');
    }

    public function test_proof_upload_is_refused_after_deadline(): void
    {
        $buyer = $this->buyer();
        $order = Order::find($this->checkout($buyer)->json('order.id'));

        $this->travel(25)->hours();

        $this->uploadProof($buyer, $order)->assertStatus(422);
        $this->assertSame('kedaluwarsa', $order->fresh()->status);
        $this->assertDatabaseCount('payment_proofs', 0);
    }

    public function test_order_awaiting_verification_never_expires(): void
    {
        $buyer = $this->buyer();
        $order = Order::find($this->checkout($buyer)->json('order.id'));
        $this->uploadProof($buyer, $order)->assertOk();

        $this->travel(10)->days();
        $this->artisan('amania:expire-orders');

        $this->assertSame('menunggu_verifikasi', $order->fresh()->status);
    }

    // ---------------------------------------------------------------- nomor 3

    public function test_coupon_quota_is_returned_when_order_expires(): void
    {
        $coupon = Coupon::create(['code' => 'SATUKALI', 'type' => 'fixed', 'value' => 5000, 'quota' => 1]);

        $this->checkout($this->buyer(), 'SATUKALI')->assertCreated();
        $this->assertSame(1, $coupon->fresh()->used_count);

        // Kuota habis selama pesanan pertama masih aktif.
        $this->checkout($this->buyer(), 'SATUKALI')->assertStatus(422);
        $this->assertSame(1, $coupon->fresh()->used_count);

        $this->travel(25)->hours();
        $this->artisan('amania:expire-orders');

        $this->assertSame(0, $coupon->fresh()->used_count, 'Kuota harus kembali saat pesanan kedaluwarsa.');
        $this->checkout($this->buyer(), 'SATUKALI')->assertCreated();
        $this->assertSame(1, $coupon->fresh()->used_count);
    }

    public function test_coupon_stays_used_after_payment_is_confirmed(): void
    {
        $coupon = Coupon::create(['code' => 'TETAP', 'type' => 'percent', 'value' => 10, 'quota' => 5]);
        $buyer = $this->buyer();
        $order = Order::find($this->checkout($buyer, 'TETAP')->json('order.id'));
        $this->uploadProof($buyer, $order)->assertOk();

        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/admin/orders/{$order->id}/confirm")->assertOk();

        $this->travel(30)->days();
        $this->artisan('amania:expire-orders');

        $this->assertSame('dikonfirmasi', $order->fresh()->status);
        $this->assertSame(1, $coupon->fresh()->used_count);
    }

    public function test_rejected_order_gets_new_deadline_then_expires_and_frees_coupon(): void
    {
        $coupon = Coupon::create(['code' => 'TOLAK', 'type' => 'fixed', 'value' => 1000, 'quota' => 1]);
        $buyer = $this->buyer();
        $order = Order::find($this->checkout($buyer, 'TOLAK')->json('order.id'));

        $this->travel(20)->hours();
        $this->uploadProof($buyer, $order)->assertOk();

        $this->travel(2)->days(); // admin baru sempat memeriksa 2 hari kemudian
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/admin/orders/{$order->id}/reject", ['reason' => 'Nominal kurang'])->assertOk();

        $order->refresh();
        $this->assertSame('ditolak', $order->status);
        $this->assertTrue($order->payment_deadline->isFuture(), 'Pembeli diberi tenggat baru untuk unggah ulang.');
        $this->assertSame(1, $coupon->fresh()->used_count, 'Kupon masih dipegang selama pesanan bisa diunggah ulang.');

        // Pembeli masih bisa unggah ulang dalam tenggat baru.
        $this->travel(5)->hours();
        $this->artisan('amania:expire-orders');
        $this->assertSame('ditolak', $order->fresh()->status);

        // Tenggat baru terlewat tanpa unggah ulang → kedaluwarsa + kupon kembali.
        $this->travel(20)->hours();
        $this->artisan('amania:expire-orders');
        $this->assertSame('kedaluwarsa', $order->fresh()->status);
        $this->assertSame(0, $coupon->fresh()->used_count);
    }

    public function test_coupon_claim_is_atomic_at_the_last_slot(): void
    {
        $coupon = Coupon::create(['code' => 'REBUT', 'type' => 'fixed', 'value' => 1000, 'quota' => 1]);

        $this->assertTrue(\App\Services\OrderLifecycle::claimCoupon($coupon));
        // Objek $coupon masih "basi" (used_count = 0), tapi klaim kedua tetap harus gagal.
        $this->assertFalse(\App\Services\OrderLifecycle::claimCoupon($coupon));
        $this->assertSame(1, $coupon->fresh()->used_count);
    }
}
