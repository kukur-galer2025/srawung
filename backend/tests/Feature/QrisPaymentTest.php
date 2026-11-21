<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Setting;
use App\Models\User;
use App\Services\PaymentInfo;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class QrisPaymentTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
        Storage::fake('public');
        Storage::disk('public')->put(PaymentInfo::DEFAULT_IMAGE, (string) file_get_contents(database_path('seeders/assets/qris-amania.webp')));
    }

    private function buyer(): User
    {
        return User::forceCreate([
            'name' => 'Pembeli QRIS',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password123',
            'role' => 'buyer',
            'is_blocked' => false,
            'email_verified_at' => now(),
        ]);
    }

    public function test_order_responses_carry_qris_payment_info_only(): void
    {
        Sanctum::actingAs($this->buyer());
        $book = Book::where('status', 'published')->firstOrFail();

        $res = $this->postJson('/api/orders', ['book_ids' => [$book->id]])->assertCreated();
        $res->assertJsonPath('payment_info.method', 'qris')
            ->assertJsonPath('payment_info.merchant_name', PaymentInfo::DEFAULT_MERCHANT)
            ->assertJsonMissingPath('bank_info');
        $this->assertStringContainsString('/storage/payment/qris-amania.webp', $res->json('payment_info.qris_url'));

        $number = $res->json('order.order_number');
        $this->getJson("/api/orders/{$number}")->assertOk()->assertJsonPath('payment_info.nmid', PaymentInfo::DEFAULT_NMID);
    }

    public function test_admin_can_replace_qris_image_and_details(): void
    {
        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());

        $url = $this->post('/api/admin/settings/qris', ['qris' => UploadedFile::fake()->image('qris-baru.png', 600, 800)], ['Accept' => 'application/json'])
            ->assertOk()
            ->json('qris_url');
        $this->assertStringContainsString('/storage/payment/', $url);
        $this->assertNotSame(PaymentInfo::DEFAULT_IMAGE, Setting::get('qris_image_path'));

        $this->putJson('/api/admin/settings', ['settings' => ['qris_merchant_name' => 'AMANIA BOOKS', 'qris_nmid' => 'ID999']])->assertOk();
        $this->putJson('/api/admin/settings', ['settings' => ['qris_nmid' => 'ID 99<script>']])->assertStatus(422);
        $this->assertSame('AMANIA BOOKS', PaymentInfo::get()['merchant_name']);
    }

    public function test_unpaid_invoice_shows_qris_instructions(): void
    {
        Sanctum::actingAs($this->buyer());
        $book = Book::where('status', 'published')->firstOrFail();
        $number = $this->postJson('/api/orders', ['book_ids' => [$book->id]])->assertCreated()->json('order.order_number');

        $res = $this->get("/api/orders/{$number}/invoice")->assertOk();
        $this->assertSame('application/pdf', $res->headers->get('Content-Type'));
        $this->assertGreaterThan(5000, strlen($res->getContent()));
    }

    public function test_guest_api_requests_get_json_401_not_server_error(): void
    {
        $this->get('/api/admin/settings')->assertStatus(401)->assertJson(['message' => 'Unauthenticated.']);
    }
}
