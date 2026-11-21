<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;
use App\Notifications\NewPaymentProofForAdmin;
use App\Notifications\OrderConfirmed;
use App\Notifications\OrderExpired;
use App\Notifications\PaymentReminder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Notifications\AnonymousNotifiable;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Nomor 5 (notifikasi admin), 6 (pengingat & kedaluwarsa), 9 (invoice PDF).
 */
class NotificationsAndInvoiceTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Storage::fake('local');
    }

    private function buyer(): User
    {
        return User::forceCreate([
            'name' => 'Sari Pembeli',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password123',
            'role' => 'buyer',
            'is_blocked' => false,
            'email_verified_at' => now(),
        ]);
    }

    private function order(User $buyer): Order
    {
        Sanctum::actingAs($buyer);
        $id = $this->postJson('/api/orders', ['book_ids' => [Book::where('status', 'published')->value('id')]])
            ->assertCreated()
            ->json('order.id');

        return Order::findOrFail($id);
    }

    private function upload(User $buyer, Order $order, ?string $note = null)
    {
        Sanctum::actingAs($buyer);

        return $this->post("/api/orders/{$order->id}/proof", array_filter([
            'proof' => UploadedFile::fake()->image('bukti.jpg'),
            'buyer_note' => $note,
        ]), ['Accept' => 'application/json']);
    }

    // ------------------------------------------------------------ 5. notifikasi admin

    public function test_admin_is_emailed_when_proof_is_uploaded(): void
    {
        Setting::set('admin_notification_email', 'kasir@contoh.test');
        $buyer = $this->buyer();
        $order = $this->order($buyer);

        $this->upload($buyer, $order, 'Transfer dari BCA a.n. Sari')->assertOk();

        Notification::assertSentOnDemand(NewPaymentProofForAdmin::class, function ($n, $channels, AnonymousNotifiable $to) use ($order) {
            $mail = $n->toMail($to);
            $html = (string) $mail->render();

            return $to->routes['mail'] === 'kasir@contoh.test'
                && $n->order->is($order)
                && str_contains($mail->subject, $order->order_number)
                && str_contains($html, 'Transfer dari BCA a.n. Sari')
                && str_contains($mail->actionUrl, "admin/pesanan?order={$order->id}");
        });
    }

    public function test_admin_email_falls_back_to_admin_account_then_store_mailbox(): void
    {
        config(['mail.from.address' => 'toko@contoh.test']);
        $adminEmail = User::where('role', 'admin')->value('email');
        $buyer = $this->buyer();
        $this->upload($buyer, $this->order($buyer))->assertOk();

        // Tanpa pengaturan khusus → email akun admin.
        Notification::assertSentOnDemand(NewPaymentProofForAdmin::class, fn ($n, $c, $to) => $to->routes['mail'] === $adminEmail);

        // Tanpa akun admin aktif → kotak masuk pengirim toko.
        User::where('role', 'admin')->update(['is_blocked' => true]);
        $this->assertSame('toko@contoh.test', \App\Services\OrderLifecycle::adminEmail());
    }

    public function test_admin_email_setting_is_validated(): void
    {
        Sanctum::actingAs(User::where('role', 'admin')->first());

        $this->putJson('/api/admin/settings', ['settings' => ['admin_notification_email' => 'bukan-email']])
            ->assertStatus(422);
        $this->putJson('/api/admin/settings', ['settings' => ['admin_notification_email' => 'admin@contoh.test']])
            ->assertOk();
        $this->assertSame('admin@contoh.test', Setting::get('admin_notification_email'));
    }

    // ------------------------------------------------------------ 6. pengingat & kedaluwarsa

    public function test_reminder_is_sent_once_when_three_hours_remain(): void
    {
        $buyer = $this->buyer();
        $order = $this->order($buyer); // tenggat 24 jam

        $this->artisan('amania:payment-reminders');
        Notification::assertNotSentTo($buyer, PaymentReminder::class);

        $this->travel(20)->hours(); // sisa 4 jam → belum
        $this->artisan('amania:payment-reminders');
        Notification::assertNotSentTo($buyer, PaymentReminder::class);

        $this->travel(90)->minutes(); // sisa 2,5 jam → kirim
        $this->artisan('amania:payment-reminders');
        $this->artisan('amania:payment-reminders'); // dijalankan lagi → tidak dobel
        Notification::assertSentToTimes($buyer, PaymentReminder::class, 1);

        $mail = (new PaymentReminder($order->fresh()))->toMail($buyer);
        $this->assertStringContainsString($order->order_number, $mail->subject);
        $this->assertStringContainsString('Rp', (string) $mail->render());
    }

    public function test_paid_orders_are_not_reminded(): void
    {
        $buyer = $this->buyer();
        $this->upload($buyer, $this->order($buyer))->assertOk();

        $this->travel(22)->hours();
        $this->artisan('amania:payment-reminders');

        Notification::assertNotSentTo($buyer, PaymentReminder::class);
    }

    public function test_rejected_order_gets_a_fresh_reminder_for_its_new_deadline(): void
    {
        $buyer = $this->buyer();
        $order = $this->order($buyer);

        $this->travel(22)->hours();
        $this->artisan('amania:payment-reminders'); // pengingat #1 (tenggat awal)

        $this->upload($buyer, $order)->assertOk();
        Sanctum::actingAs(User::where('role', 'admin')->first());
        $this->patchJson("/api/admin/orders/{$order->id}/reject", ['reason' => 'Nominal kurang'])->assertOk();
        $this->assertNull($order->fresh()->reminder_sent_at);

        $this->travel(22)->hours(); // 2 jam sebelum tenggat unggah ulang
        $this->artisan('amania:payment-reminders'); // pengingat #2

        Notification::assertSentToTimes($buyer, PaymentReminder::class, 2);
        $mail = (new PaymentReminder($order->fresh()))->toMail($buyer);
        $this->assertStringContainsString('unggah ulang', $mail->subject);
    }

    public function test_buyer_is_emailed_when_order_expires(): void
    {
        $buyer = $this->buyer();
        $order = $this->order($buyer);

        $this->travel(25)->hours();
        $this->artisan('amania:expire-orders');
        $this->artisan('amania:expire-orders'); // tidak dobel

        Notification::assertSentToTimes($buyer, OrderExpired::class, 1);
        Notification::assertSentTo($buyer, OrderExpired::class, fn ($n) => $n->order->is($order));
    }

    // ------------------------------------------------------------ 9. invoice

    public function test_buyer_downloads_own_invoice_as_pdf(): void
    {
        $buyer = $this->buyer();
        $order = $this->order($buyer);

        Sanctum::actingAs($buyer);
        $res = $this->get("/api/orders/{$order->order_number}/invoice");

        $res->assertOk()->assertHeader('Content-Type', 'application/pdf');
        $this->assertStringStartsWith('%PDF', $res->getContent());
        $this->assertStringContainsString("Invoice-{$order->order_number}.pdf", $res->headers->get('Content-Disposition'));
    }

    public function test_invoice_of_another_buyer_is_not_accessible(): void
    {
        $order = $this->order($this->buyer());

        Sanctum::actingAs($this->buyer());
        $this->getJson("/api/orders/{$order->order_number}/invoice")->assertNotFound();
    }

    public function test_admin_can_download_any_invoice(): void
    {
        $order = $this->order($this->buyer());

        Sanctum::actingAs(User::where('role', 'admin')->first());
        $res = $this->get("/api/admin/orders/{$order->id}/invoice");
        $res->assertOk();
        $this->assertStringStartsWith('%PDF', $res->getContent());
    }

    public function test_confirmation_email_has_paid_invoice_attached(): void
    {
        $buyer = $this->buyer();
        $order = $this->order($buyer);
        $this->upload($buyer, $order)->assertOk();

        Sanctum::actingAs(User::where('role', 'admin')->first());
        $this->patchJson("/api/admin/orders/{$order->id}/confirm")->assertOk();

        Notification::assertSentTo($buyer, OrderConfirmed::class, function ($n) use ($buyer, $order) {
            $attachment = $n->toMail($buyer)->rawAttachments[0] ?? null;

            return $attachment
                && $attachment['name'] === "Invoice-{$order->order_number}.pdf"
                && str_starts_with($attachment['data'], '%PDF');
        });
    }
}
