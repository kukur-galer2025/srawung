<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Coupon;
use App\Models\CreatorEarning;
use App\Models\CreatorPayout;
use App\Models\Order;
use App\Models\User;
use App\Notifications\PayoutProcessed;
use App\Notifications\PayoutRequested;
use App\Services\CreatorTerms;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Role kreator: dijadikan oleh admin, kelola buku & voucher sendiri, bagi hasil 80/20,
 * voucher kreator ditanggung kreator, kupon Srawung ditanggung Srawung, penarikan saldo.
 */
class CreatorTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function user(string $role = 'buyer'): User
    {
        return User::forceCreate([
            'name' => 'Pengguna ' . $role, 'email' => fake()->unique()->safeEmail(), 'password' => 'password123',
            'role' => $role, 'is_blocked' => false, 'email_verified_at' => now(),
        ]);
    }

    private function admin(): User
    {
        return User::where('role', 'admin')->firstOrFail();
    }

    private function makeCreator(): User
    {
        $u = $this->user();
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/admin/users/{$u->id}/creator", ['enabled' => true, 'display_name' => 'Rina Penulis'])->assertOk();

        return $u->fresh();
    }

    private function acceptTerms(User $creator): void
    {
        Sanctum::actingAs($creator);
        $this->postJson('/api/creator/terms/accept', ['version' => CreatorTerms::VERSION, 'agree' => true])->assertOk();
    }

    private function creatorBook(User $creator, int $price = 100000): Book
    {
        return Book::create([
            'creator_id' => $creator->id, 'title' => 'Buku Kreator ' . uniqid(), 'slug' => 'buku-kreator-' . uniqid(),
            'author' => 'Rina', 'synopsis' => 'x', 'price' => $price, 'status' => 'published', 'total_pages' => 10, 'preview_pages' => 2,
        ]);
    }

    private function checkoutAndConfirm(User $buyer, array $bookIds, ?string $coupon = null): Order
    {
        Sanctum::actingAs($buyer);
        $res = $this->postJson('/api/orders', ['book_ids' => $bookIds, 'coupon_code' => $coupon])->assertCreated();
        $order = Order::find($res->json('order.id'));
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/admin/orders/{$order->id}/confirm")->assertOk();

        return $order->fresh('orderItems');
    }

    public function test_only_admin_can_make_creators_and_creator_area_is_protected(): void
    {
        $buyer = $this->user();
        Sanctum::actingAs($buyer);
        $this->getJson('/api/creator/summary')->assertForbidden();
        $this->patchJson("/api/admin/users/{$buyer->id}/creator", ['enabled' => true])->assertForbidden();

        $creator = $this->makeCreator();
        $this->assertSame('creator', $creator->role);
        $this->assertSame('Rina Penulis', $creator->creatorProfile->display_name);

        Sanctum::actingAs($creator);
        $this->getJson('/api/creator/summary')->assertOk()->assertJsonPath('commission_percent', 20);
        $this->getJson('/api/admin/orders')->assertForbidden();
    }

    public function test_creator_manages_only_own_books(): void
    {
        $creator = $this->makeCreator();
        $other = $this->makeCreator();
        $foreign = $this->creatorBook($other);
        $amaniaBook = Book::whereNull('creator_id')->firstOrFail();

        $this->acceptTerms($creator);
        $id = $this->postJson('/api/creator/books', [
            'title' => 'Novel Pertama Saya', 'author' => 'Rina', 'synopsis' => 'Kisah.', 'price' => 45000, 'status' => 'published',
        ])->assertCreated()->json('book.id');
        $this->assertSame($creator->id, Book::find($id)->creator_id);

        $this->getJson('/api/creator/books')->assertOk()->assertJsonCount(1, 'data');
        $this->putJson("/api/creator/books/{$foreign->id}", ['title' => 'Bajak', 'author' => 'x', 'synopsis' => 'x', 'price' => 1, 'status' => 'draft'])->assertNotFound();
        $this->deleteJson("/api/creator/books/{$amaniaBook->id}")->assertNotFound();

        // Buku yang sudah terjual tidak bisa dihapus (hanya di-draf).
        $this->checkoutAndConfirm($this->user(), [$id]);
        Sanctum::actingAs($creator);
        $this->deleteJson("/api/creator/books/{$id}")->assertStatus(422);
    }

    public function test_creator_voucher_only_discounts_own_or_selected_books(): void
    {
        $creator = $this->makeCreator();
        $other = $this->makeCreator();
        $bookA = $this->creatorBook($creator, 100000);
        $bookB = $this->creatorBook($creator, 50000);
        $foreign = $this->creatorBook($other, 80000);
        $amaniaBook = Book::whereNull('creator_id')->where('status', 'published')->firstOrFail();

        Sanctum::actingAs($creator);
        // Tidak bisa memasang voucher ke buku Srawung / kreator lain.
        $this->postJson('/api/creator/coupons', ['code' => 'CURANG', 'type' => 'percent', 'value' => 10, 'restrict_books' => true, 'book_ids' => [$foreign->id]])
            ->assertStatus(422)->assertJsonValidationErrors('book_ids.0');
        $this->postJson('/api/creator/coupons', ['code' => 'CURANG', 'type' => 'percent', 'value' => 10, 'restrict_books' => true, 'book_ids' => [$amaniaBook->id]])
            ->assertStatus(422);
        // Mode "buku tertentu" wajib memilih buku.
        $this->postJson('/api/creator/coupons', ['code' => 'KOSONG', 'type' => 'percent', 'value' => 10, 'restrict_books' => true, 'book_ids' => []])
            ->assertStatus(422)->assertJsonValidationErrors('book_ids');

        // Voucher hanya untuk buku A.
        $this->postJson('/api/creator/coupons', ['code' => 'KHUSUSA', 'type' => 'percent', 'value' => 20, 'restrict_books' => true, 'book_ids' => [$bookA->id]])
            ->assertCreated()->assertJsonPath('coupon.books.0.id', $bookA->id);

        Sanctum::actingAs($this->user());
        $this->postJson('/api/coupons/validate', ['code' => 'KHUSUSA', 'book_ids' => [$bookB->id, $foreign->id, $amaniaBook->id]])->assertStatus(422);
        $this->postJson('/api/coupons/validate', ['code' => 'KHUSUSA', 'book_ids' => [$bookA->id, $bookB->id, $foreign->id, $amaniaBook->id]])
            ->assertOk()->assertJsonPath('discount', 20000); // 20% × buku A saja

        // Buku pilihan terhapus → voucher tidak berubah jadi berlaku untuk semua buku.
        Sanctum::actingAs($creator);
        $this->deleteJson("/api/creator/books/{$bookA->id}")->assertOk();
        Sanctum::actingAs($this->user());
        $this->postJson('/api/coupons/validate', ['code' => 'KHUSUSA', 'book_ids' => [$bookB->id]])->assertStatus(422);
    }

    public function test_revenue_share_and_who_bears_coupon_discounts(): void
    {
        $creator = $this->makeCreator();
        $book = $this->creatorBook($creator, 100000);
        $amaniaBook = Book::whereNull('creator_id')->where('status', 'published')->firstOrFail();

        // 1) Tanpa kupon: 100.000 → Srawung 20.000, kreator 80.000.
        $this->checkoutAndConfirm($this->user(), [$book->id]);
        $e = CreatorEarning::latest('id')->first();
        $this->assertSame([100000, 20000, 80000], [$e->gross, $e->commission, $e->net]);

        // 2) Voucher kreator 10% hanya memotong buku kreator; diskon ditanggung kreator.
        Sanctum::actingAs($creator);
        $this->postJson('/api/creator/coupons', ['code' => 'rina10', 'type' => 'percent', 'value' => 10])->assertCreated();
        $buyer = $this->user();
        Sanctum::actingAs($buyer);
        $this->postJson('/api/coupons/validate', ['code' => 'RINA10', 'book_ids' => [$amaniaBook->id]])->assertStatus(422);
        $this->postJson('/api/coupons/validate', ['code' => 'RINA10', 'book_ids' => [$amaniaBook->id, $book->id]])
            ->assertOk()->assertJsonPath('discount', 10000);

        $order = $this->checkoutAndConfirm($buyer, [$amaniaBook->id, $book->id], 'RINA10');
        $this->assertSame(10000, (int) $order->orderItems->firstWhere('book_id', $book->id)->discount);
        $this->assertSame(0, (int) $order->orderItems->firstWhere('book_id', $amaniaBook->id)->discount);
        $e = CreatorEarning::where('order_id', $order->id)->first();
        $this->assertSame([90000, 18000, 72000], [$e->gross, $e->commission, $e->net]);
        $this->assertSame(1, CreatorEarning::where('order_id', $order->id)->count(), 'buku Srawung tidak masuk buku besar kreator');

        // 3) Kupon Srawung: diskon ditanggung Srawung, pendapatan kreator utuh.
        Coupon::create(['code' => 'AMANIA50', 'type' => 'percent', 'value' => 50, 'is_public' => false]);
        $order = $this->checkoutAndConfirm($this->user(), [$book->id], 'AMANIA50');
        $this->assertSame(50000, (int) $order->orderItems->first()->discount);
        $e = CreatorEarning::where('order_id', $order->id)->first();
        $this->assertSame([100000, 20000, 80000], [$e->gross, $e->commission, $e->net]);

        // Komisi khusus per kreator.
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/admin/creators/{$creator->id}/commission", ['commission_percent' => 10])->assertOk();
        $this->checkoutAndConfirm($this->user(), [$book->id]);
        $this->assertSame(90000, CreatorEarning::latest('id')->first()->net);

        Sanctum::actingAs($creator);
        $this->getJson('/api/creator/summary')->assertJsonPath('balance.available', 80000 + 72000 + 80000 + 90000);
        Notification::assertSentTo($creator, \App\Notifications\CreatorSale::class);

        // Laporan admin memisahkan bagian kreator dari pendapatan bersih Srawung.
        Sanctum::actingAs($this->admin());
        $report = $this->getJson('/api/admin/reports')->assertOk()->json('summary');
        $this->assertSame(80000 + 72000 + 80000 + 90000, $report['creator_share']);
        $this->assertSame($report['total_revenue'] - $report['creator_share'], $report['amania_net']);

        // Halaman publik kreator & info penerbit di detail buku.
        $slug = $creator->fresh()->creatorProfile->slug;
        $this->assertSame('rina-penulis', $slug);
        $this->getJson("/api/creators/{$slug}")->assertOk()->assertJsonPath('display_name', 'Rina Penulis')->assertJsonPath('books.0.id', $book->id);
        $this->getJson("/api/books/{$book->slug}")->assertJsonPath('creator.slug', 'rina-penulis');
        $this->getJson("/api/books/{$amaniaBook->slug}")->assertJsonPath('creator', null);
    }

    public function test_payout_request_and_admin_processing(): void
    {
        $creator = $this->makeCreator();
        $book = $this->creatorBook($creator, 200000);
        $this->checkoutAndConfirm($this->user(), [$book->id]); // saldo 160.000

        Sanctum::actingAs($creator);
        $this->putJson('/api/creator/profile', [
            'display_name' => 'Rina Penulis', 'payout_method' => 'bank', 'payout_provider' => 'BCA', 'payout_account' => '1234567890', 'payout_holder' => 'Rina',
        ])->assertOk();
        $this->postJson('/api/creator/payouts', ['amount' => 120000, 'agree' => true])->assertStatus(422)->assertJsonPath('code', 'terms_required');

        $this->acceptTerms($creator);
        $this->getJson('/api/creator/summary')->assertJsonPath('min_payout', 100000)->assertJsonPath('payout_fee', 5000)
            ->assertJsonPath('terms.needs_acceptance', false);
        $this->postJson('/api/creator/payouts', ['amount' => 120000])->assertStatus(422);                    // belum mencentang persetujuan
        $this->postJson('/api/creator/payouts', ['amount' => 90000, 'agree' => true])->assertStatus(422);    // di bawah minimum 100.000
        $this->postJson('/api/creator/payouts', ['amount' => 170000, 'agree' => true])->assertStatus(422);   // melebihi saldo
        $payoutId = $this->postJson('/api/creator/payouts', ['amount' => 120000, 'agree' => true])->assertCreated()
            ->assertJsonPath('payout.fee', 5000)->assertJsonPath('payout.net_amount', 115000)->json('payout.id');
        $this->assertSame(CreatorTerms::VERSION, CreatorPayout::find($payoutId)->terms_version);
        Notification::assertSentOnDemand(PayoutRequested::class);
        $this->postJson('/api/creator/payouts', ['amount' => 100000, 'agree' => true])->assertStatus(422); // masih ada yang diproses
        // Saldo berkurang sebesar jumlah yang ditarik (biaya admin termasuk di dalamnya).
        $this->getJson('/api/creator/summary')->assertJsonPath('balance.available', 40000)->assertJsonPath('balance.pending', 120000);

        // Ditolak → saldo kembali utuh (biaya admin tidak dipungut).
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/admin/payouts/{$payoutId}/reject", ['note' => 'Nama rekening tidak cocok'])->assertOk();
        Notification::assertSentTo($creator, PayoutProcessed::class);
        Sanctum::actingAs($creator);
        $this->getJson('/api/creator/summary')->assertJsonPath('balance.available', 160000);

        // Diajukan ulang semua saldo lalu dibayar: kreator menerima 160.000 − 5.000.
        $payoutId = $this->postJson('/api/creator/payouts', ['amount' => 160000, 'agree' => true])->assertCreated()->json('payout.id');
        Sanctum::actingAs($this->admin());
        $this->postJson("/api/admin/payouts/{$payoutId}/paid", ['reference' => 'TRF-001'])->assertOk();
        $paid = CreatorPayout::find($payoutId);
        $this->assertSame('paid', $paid->status);
        $this->assertSame(155000, $paid->net_amount);
        $mail = (new PayoutProcessed($paid))->toMail($creator);
        $this->assertStringContainsString('Rp 155.000', $mail->subject);
        Sanctum::actingAs($creator);
        $this->getJson('/api/creator/summary')->assertJsonPath('balance.available', 0)->assertJsonPath('balance.paid', 160000);
    }

    public function test_creator_terms_must_be_accepted_before_publishing(): void
    {
        $this->getJson('/api/creator-terms')->assertOk()
            ->assertJsonPath('version', CreatorTerms::VERSION)->assertJsonPath('min_payout', 100000)->assertJsonPath('payout_fee', 5000);

        $creator = $this->makeCreator();
        Sanctum::actingAs($creator);
        $this->getJson('/api/creator/summary')->assertJsonPath('terms.needs_acceptance', true);
        $book = ['title' => 'Draf', 'author' => 'Rina', 'synopsis' => 'x', 'price' => 45000, 'status' => 'draft'];
        $this->postJson('/api/creator/books', $book)->assertStatus(422)->assertJsonPath('code', 'terms_required');

        $this->postJson('/api/creator/terms/accept', ['version' => CreatorTerms::VERSION])->assertStatus(422);            // tanpa centang
        $this->postJson('/api/creator/terms/accept', ['version' => '2020-01-01', 'agree' => true])->assertStatus(422);    // versi lama
        $this->postJson('/api/creator/terms/accept', ['version' => CreatorTerms::VERSION, 'agree' => true])->assertOk();

        $this->assertNotNull($creator->fresh()->creatorProfile->terms_accepted_at);
        $this->postJson('/api/creator/books', $book)->assertCreated();
    }
}
