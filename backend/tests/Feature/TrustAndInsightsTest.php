<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookReport;
use App\Models\CreatorPayout;
use App\Models\Order;
use App\Models\PaymentProof;
use App\Models\User;
use App\Models\UserLibrary;
use App\Notifications\BookReportReceived;
use App\Notifications\BookReportResolved;
use App\Notifications\BookTakenDown;
use App\Notifications\CreatorSaleReversed;
use App\Notifications\NewBookReport;
use App\Notifications\OrderRefunded;
use App\Services\CreatorLedger;
use App\Services\ProofInspector;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Refund + koreksi saldo kreator, deteksi bukti dipakai ulang, laporan konten, analitik kreator. */
class TrustAndInsightsTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Storage::fake('local');
    }

    private function user(string $role = 'buyer', array $attrs = []): User
    {
        return User::forceCreate([
            'name' => 'Pengguna ' . $role, 'email' => fake()->unique()->safeEmail(), 'password' => 'password123',
            'role' => $role, 'is_blocked' => false, 'email_verified_at' => now(), 'created_at' => now()->subWeek(), ...$attrs,
        ]);
    }

    private function admin(): User
    {
        return User::where('role', 'admin')->firstOrFail();
    }

    private function creatorBook(User $creator, int $price = 100000): Book
    {
        return Book::create([
            'creator_id' => $creator->id, 'title' => 'Buku Kreator ' . uniqid(), 'slug' => 'buku-kreator-' . uniqid(),
            'author' => 'Rina', 'synopsis' => 'x', 'price' => $price, 'status' => 'published', 'total_pages' => 10, 'preview_pages' => 2,
        ]);
    }

    private function order(User $buyer, array $bookIds): Order
    {
        Sanctum::actingAs($buyer);
        $id = $this->postJson('/api/orders', ['book_ids' => $bookIds])->assertCreated()->json('order.id');

        return Order::findOrFail($id);
    }

    private function confirm(Order $order): Order
    {
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/admin/orders/{$order->id}/confirm")->assertOk();

        return $order->fresh();
    }

    /**
     * Gambar "struk" 600×900 dengan pola acak per $seed. $scale < 1 = gambar yang SAMA
     * diperkecil lalu dikompres ulang (seperti di-screenshot/diteruskan lewat chat).
     */
    private function receipt(int $seed, float $scale = 1.0, int $quality = 90): UploadedFile
    {
        $img = imagecreatetruecolor(600, 900);
        imagefill($img, 0, 0, imagecolorallocate($img, 255, 255, 255));
        mt_srand($seed);
        for ($i = 0; $i < 40; $i++) {
            $c = imagecolorallocate($img, mt_rand(0, 200), mt_rand(0, 200), mt_rand(0, 200));
            imagefilledrectangle($img, mt_rand(0, 600), mt_rand(0, 900), mt_rand(0, 600), mt_rand(0, 900), $c);
        }
        if ($scale !== 1.0) {
            $small = imagecreatetruecolor((int) (600 * $scale), (int) (900 * $scale));
            imagecopyresampled($small, $img, 0, 0, 0, 0, (int) (600 * $scale), (int) (900 * $scale), 600, 900);
            $img = $small;
        }
        ob_start();
        imagejpeg($img, null, $quality);
        $bytes = ob_get_clean();

        return UploadedFile::fake()->createWithContent("struk-{$seed}.jpg", $bytes);
    }

    /* ------------------------------ Refund ------------------------------ */

    public function test_refund_revokes_access_reverses_creator_earnings_and_notifies(): void
    {
        $creator = $this->user('creator');
        $book = $this->creatorBook($creator, 100000);
        $buyer = $this->user();
        $order = $this->confirm($this->order($buyer, [$book->id]));
        $this->assertSame(80000, CreatorLedger::balance($creator->id)['available']);

        // Pembeli tidak bisa me-refund sendiri; pesanan belum dikonfirmasi tidak bisa di-refund.
        Sanctum::actingAs($buyer);
        $this->postJson("/api/admin/orders/{$order->id}/refund", ['reason' => 'Bayar dua kali'])->assertForbidden();
        $pending = $this->order($this->user(), [$book->id]);
        Sanctum::actingAs($this->admin());
        $this->postJson("/api/admin/orders/{$pending->id}/refund", ['reason' => 'Bayar dua kali'])->assertStatus(422);

        $this->postJson("/api/admin/orders/{$order->id}/refund", ['reason' => 'Pembeli membayar dua kali', 'reference' => 'TRF-9'])
            ->assertOk()->assertJsonPath('order.status', 'dikembalikan');

        $order->refresh();
        $this->assertSame('dikembalikan', $order->status);
        $this->assertSame('TRF-9', $order->refund_reference);
        $this->assertSame('revoked', UserLibrary::where('user_id', $buyer->id)->where('book_id', $book->id)->value('access_status'));
        $balance = CreatorLedger::balance($creator->id);
        $this->assertSame([0, 80000, 0], [$balance['available'], $balance['reversed'], $balance['debt']]);
        Notification::assertSentTo($buyer, OrderRefunded::class);
        Notification::assertSentTo($creator, CreatorSaleReversed::class);

        // Refund kedua kali ditolak; laporan penjualan tidak lagi menghitung pesanan ini.
        $this->postJson("/api/admin/orders/{$order->id}/refund", ['reason' => 'lagi lagi'])->assertStatus(422);
        $this->getJson('/api/admin/reports')->assertJsonPath('summary.creator_share', 0);
    }

    public function test_refund_after_payout_becomes_debt_settled_by_next_sales(): void
    {
        $creator = $this->user('creator');
        $book = $this->creatorBook($creator, 150000);
        $order = $this->confirm($this->order($this->user(), [$book->id])); // saldo 120.000
        CreatorPayout::create(['creator_id' => $creator->id, 'amount' => 120000, 'fee' => 5000, 'net_amount' => 115000, 'status' => 'paid',
            'payout_method' => 'bank', 'payout_provider' => 'BCA', 'payout_account' => '1', 'payout_holder' => 'R']);

        Sanctum::actingAs($this->admin());
        $this->postJson("/api/admin/orders/{$order->id}/refund", ['reason' => 'Buku tidak bisa dibuka', 'revoke_access' => false])->assertOk();
        $this->assertSame(120000, CreatorLedger::balance($creator->id)['debt']);

        // Penjualan berikutnya menutup saldo minus lebih dulu.
        $this->confirm($this->order($this->user(), [$book->id]));
        $b = CreatorLedger::balance($creator->id);
        $this->assertSame([0, 0], [$b['available'], $b['debt']]);
        $this->confirm($this->order($this->user(), [$book->id]));
        $this->assertSame(120000, CreatorLedger::balance($creator->id)['available']);
    }

    /* -------------------------- Bukti pembayaran -------------------------- */

    public function test_reused_payment_proof_is_flagged_for_admin(): void
    {
        $book = Book::where('status', 'published')->whereNull('creator_id')->firstOrFail();
        $alice = $this->user();
        $bob = $this->user();
        $orderA = $this->order($alice, [$book->id]);
        $this->travel(5)->minutes();
        Sanctum::actingAs($alice);
        $this->postJson("/api/orders/{$orderA->id}/proof", ['proof' => $this->receipt(1)])->assertOk();
        $this->assertNull(PaymentProof::where('order_id', $orderA->id)->first()->risk_flags);

        // Bob memakai file yang persis sama.
        $orderB = $this->order($bob, [$book->id]);
        $this->travel(5)->minutes();
        Sanctum::actingAs($bob);
        $this->postJson("/api/orders/{$orderB->id}/proof", ['proof' => $this->receipt(1)])->assertOk();
        $proofB = PaymentProof::where('order_id', $orderB->id)->first();
        $this->assertSame(['bukti_identik'], $proofB->risk_flags);
        $this->assertSame(100, $proofB->similarity);

        Sanctum::actingAs($this->admin());
        $this->getJson("/api/admin/orders/{$orderB->id}")->assertOk()
            ->assertJsonPath('payment_proofs.0.check.match.order_number', $orderA->order_number)
            ->assertJsonPath('payment_proofs.0.check.match.same_buyer', false)
            ->assertJsonMissingPath('payment_proofs.0.file_hash');
        $this->assertSame(1, collect($this->getJson('/api/admin/orders?status=menunggu_verifikasi')->json('data'))
            ->firstWhere('id', $orderB->id)['flagged_proofs_count']);

        // Gambar yang sama tetapi diperkecil & dikompres ulang → "sangat mirip".
        $carol = $this->user();
        $orderC = $this->order($carol, [$book->id]);
        $this->travel(5)->minutes();
        Sanctum::actingAs($carol);
        $this->postJson("/api/orders/{$orderC->id}/proof", ['proof' => $this->receipt(1, 0.7, 60)])->assertOk();
        $proofC = PaymentProof::where('order_id', $orderC->id)->first();
        $this->assertSame(['bukti_mirip'], $proofC->risk_flags);
        $this->assertGreaterThanOrEqual(96, $proofC->similarity);

        // Bukti yang berbeda tidak ditandai.
        $dan = $this->user();
        $orderD = $this->order($dan, [$book->id]);
        $this->travel(5)->minutes();
        Sanctum::actingAs($dan);
        $this->postJson("/api/orders/{$orderD->id}/proof", ['proof' => $this->receipt(77)])->assertOk();
        $this->assertNull(PaymentProof::where('order_id', $orderD->id)->first()->risk_flags);
    }

    public function test_new_account_and_instant_upload_are_flagged(): void
    {
        $book = Book::where('status', 'published')->whereNull('creator_id')->firstOrFail();
        $fresh = $this->user('buyer', ['created_at' => now()->subHour()]);
        $order = $this->order($fresh, [$book->id]);
        $this->postJson("/api/orders/{$order->id}/proof", ['proof' => $this->receipt(5)])->assertOk();

        $this->assertEqualsCanonicalizing(['akun_baru', 'unggah_terlalu_cepat'], PaymentProof::where('order_id', $order->id)->first()->risk_flags);
        $this->assertSame(0, ProofInspector::hamming(str_repeat('f', 64), str_repeat('f', 64)));
        $this->assertSame(256, ProofInspector::hamming(str_repeat('f', 64), str_repeat('0', 64)));
    }

    /* ---------------------------- Laporan konten ---------------------------- */

    public function test_copyright_report_flow_takedown_and_reject(): void
    {
        $creator = $this->user('creator');
        $book = $this->creatorBook($creator);
        $payload = [
            'reporter_name' => 'Budi Pemilik', 'reporter_email' => 'budi@example.com', 'type' => 'hak_cipta', 'relationship' => 'pemilik',
            'description' => 'Isi bab 1–5 buku ini disalin utuh dari buku saya yang terbit tahun 2024.', 'evidence_url' => 'https://example.com/buku-asli',
        ];

        $this->postJson("/api/books/{$book->slug}/report", $payload)->assertStatus(422); // tanpa pernyataan
        $this->postJson("/api/books/{$book->slug}/report", [...$payload, 'statement' => true, 'description' => 'pendek'])->assertStatus(422);
        $this->postJson("/api/books/{$book->slug}/report", [...$payload, 'statement' => true])->assertCreated();
        $this->postJson("/api/books/{$book->slug}/report", [...$payload, 'statement' => true])->assertStatus(422); // duplikat
        Notification::assertSentOnDemand(NewBookReport::class);
        Notification::assertSentOnDemand(BookReportReceived::class);
        $report = BookReport::firstOrFail();

        Sanctum::actingAs($creator);
        $this->getJson('/api/admin/book-reports')->assertForbidden();

        Sanctum::actingAs($this->admin());
        $this->getJson('/api/admin/book-reports')->assertOk()->assertJsonPath('data.0.id', $report->id)->assertJsonMissingPath('data.0.ip');
        $this->patchJson("/api/admin/book-reports/{$report->id}", ['action' => 'takedown'])->assertStatus(422); // catatan wajib
        $this->patchJson("/api/admin/book-reports/{$report->id}", ['action' => 'review'])->assertOk();
        $this->patchJson("/api/admin/book-reports/{$report->id}", ['action' => 'takedown', 'note' => 'Terbukti menyalin.'])->assertOk();

        $this->assertSame('draft', $book->fresh()->status);
        $this->assertSame('diterima', $report->fresh()->status);
        Notification::assertSentOnDemand(BookReportResolved::class);
        Notification::assertSentTo($creator, BookTakenDown::class);
        $this->patchJson("/api/admin/book-reports/{$report->id}", ['action' => 'reject', 'note' => 'x'])->assertStatus(422); // sudah diputuskan
        $this->postJson("/api/books/{$book->slug}/report", [...$payload, 'statement' => true])->assertNotFound(); // buku sudah tidak dijual

        // Laporan yang tidak terbukti ditolak; buku tetap dijual.
        $other = $this->creatorBook($creator);
        $this->postJson("/api/books/{$other->slug}/report", [...$payload, 'type' => 'lainnya', 'relationship' => 'pembaca', 'statement' => true])->assertCreated();
        $second = BookReport::where('book_id', $other->id)->firstOrFail();
        Sanctum::actingAs($this->admin());
        $this->patchJson("/api/admin/book-reports/{$second->id}", ['action' => 'reject', 'note' => 'Tidak ditemukan pelanggaran.'])->assertOk();
        $this->assertSame('published', $other->fresh()->status);
    }

    /* ------------------------------ Analitik ------------------------------ */

    public function test_creator_analytics_funnel_counts_only_own_books(): void
    {
        $creator = $this->user('creator');
        $book = $this->creatorBook($creator, 100000);
        $foreign = $this->creatorBook($this->user('creator'));

        DB::table('book_views')->insert(array_fill(0, 40, ['book_id' => $book->id, 'user_id' => null, 'created_at' => now()]));
        DB::table('book_views')->insert(['book_id' => $book->id, 'user_id' => null, 'created_at' => now()->subDays(60)]); // di luar periode
        DB::table('book_views')->insert(['book_id' => $foreign->id, 'user_id' => null, 'created_at' => now()]);

        // Masuk keranjang: tamu yang sama dihitung sekali per hari.
        $this->postJson("/api/books/{$book->slug}/cart-event")->assertNoContent();
        $this->postJson("/api/books/{$book->slug}/cart-event")->assertNoContent();
        Sanctum::actingAs($this->user());
        $this->postJson("/api/books/{$book->slug}/cart-event")->assertNoContent();

        $this->order($this->user(), [$book->id]);                       // checkout tanpa bayar
        $paid = $this->confirm($this->order($this->user(), [$book->id])); // checkout & dibayar
        $refunded = $this->confirm($this->order($this->user(), [$book->id]));
        Sanctum::actingAs($this->admin());
        $this->postJson("/api/admin/orders/{$refunded->id}/refund", ['reason' => 'Refund uji'])->assertOk();

        Sanctum::actingAs($creator);
        $res = $this->getJson('/api/creator/analytics?days=30')->assertOk();
        $this->assertSame([40, 2, 3, 1], array_column($res->json('funnel'), 'value'));
        $this->assertSame(80000, $res->json('net'));
        $this->assertCount(1, $res->json('books'));
        $this->assertSame(2.5, $res->json('books.0.conversion'));
        $this->assertSame('warning', $res->json('books.0.insight.tone')); // 2/40 = 5% masuk keranjang, 3 checkout → hanya 1 dibayar
        $this->assertNotNull($paid);
    }
}
