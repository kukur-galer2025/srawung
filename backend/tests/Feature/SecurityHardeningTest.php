<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\CreatorProfile;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PaymentProof;
use App\Models\ReadingSession;
use App\Models\User;
use App\Models\UserLibrary;
use App\Notifications\BookReportReceived;
use App\Notifications\NewPaymentProofForAdmin;
use App\Notifications\SecurityNotice;
use App\Services\CreatorTerms;
use App\Services\Security\Totp;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Meniru serangan nyata: setiap tes adalah satu cara membobol yang harus gagal. */
class SecurityHardeningTest extends TestCase
{
    use RefreshDatabase;

    private const PASSWORD = 'Kopi-pagi-27';

    protected function setUp(): void
    {
        parent::setUp();
        Notification::fake();
    }

    private function user(string $role = 'buyer', array $attrs = []): User
    {
        return User::forceCreate($attrs + [
            'name' => "Uji {$role}", 'email' => fake()->unique()->safeEmail(), 'password' => self::PASSWORD,
            'role' => $role, 'is_blocked' => false, 'email_verified_at' => now(),
        ]);
    }

    private function book(array $attrs = []): Book
    {
        return Book::create($attrs + ['title' => 'Buku Aman', 'slug' => 'buku-aman-' . fake()->unique()->randomNumber(6), 'author' => 'Penulis', 'synopsis' => 'x', 'price' => 50000, 'status' => 'published', 'total_pages' => 10]);
    }

    private function order(User $user, string $status = 'menunggu_pembayaran'): Order
    {
        $order = Order::create(['order_number' => 'AMN-' . fake()->unique()->randomNumber(8), 'user_id' => $user->id, 'total' => 50000, 'status' => $status, 'payment_deadline' => now()->addDay()]);
        OrderItem::create(['order_id' => $order->id, 'book_id' => $this->book()->id, 'price' => 50000]);

        return $order;
    }

    /** File unggahan sungguhan: isi & nama bisa berbeda, seperti kiriman penyerang. */
    private function rawUpload(string $content, string $clientName, string $clientMime): UploadedFile
    {
        $path = tempnam(sys_get_temp_dir(), 'atk');
        file_put_contents($path, $content);

        return new UploadedFile($path, $clientName, $clientMime, null, true);
    }

    private function jpeg(): string
    {
        ob_start();
        imagejpeg(imagecreatetruecolor(60, 80));

        return (string) ob_get_clean();
    }

    private function googleSays(array $payload): void
    {
        config(['services.google.client_id' => 'klien-uji']);
        Http::fake(['oauth2.googleapis.com/tokeninfo*' => Http::response($payload + ['aud' => 'klien-uji', 'iss' => 'accounts.google.com', 'email_verified' => 'true', 'name' => 'Korban'])]);
    }

    /* ---------------- Login ---------------- */

    public function test_browsing_does_not_exhaust_the_login_limit(): void
    {
        for ($i = 0; $i < 40; $i++) {
            $this->getJson('/api/search/suggest?q=php');
        }
        $user = $this->user();
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])->assertOk()->assertJsonStructure(['token']);
    }

    public function test_password_guessing_is_locked_per_account(): void
    {
        $user = $this->user();
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => "tebak{$i}"])->assertStatus(422);
        }
        // Sandi benar pun ditahan sampai jeda habis.
        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])->assertStatus(429)->assertHeader('Retry-After');
        // Akun lain tidak ikut terkunci.
        $other = $this->user();
        $this->postJson('/api/auth/login', ['email' => $other->email, 'password' => self::PASSWORD])->assertOk();
    }

    public function test_login_errors_do_not_reveal_which_accounts_exist(): void
    {
        $normal = $this->user();
        $google = $this->user('buyer', ['password' => null, 'google_id' => 'g-1']);
        $messages = collect([$normal->email, $google->email, 'tidak-ada@contoh.test'])
            ->map(fn ($e) => $this->postJson('/api/auth/login', ['email' => $e, 'password' => 'salah-123'])->assertStatus(422)->json('message'));

        $this->assertCount(1, $messages->unique());
    }

    public function test_login_tokens_expire_and_admin_tokens_expire_sooner(): void
    {
        $admin = $this->user('admin');
        $buyer = $this->user();
        $adminToken = $this->postJson('/api/auth/login', ['email' => $admin->email, 'password' => self::PASSWORD])->json('token');
        $buyerToken = $this->postJson('/api/auth/login', ['email' => $buyer->email, 'password' => self::PASSWORD])->json('token');

        $this->travel(13)->hours();
        $this->app['auth']->forgetGuards();
        $this->withToken($adminToken)->getJson('/api/auth/me')->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->withToken($buyerToken)->getJson('/api/auth/me')->assertOk();

        $this->travel(31)->days();
        $this->app['auth']->forgetGuards();
        $this->withToken($buyerToken)->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_admin_is_alerted_on_login_from_a_new_network(): void
    {
        $admin = $this->user('admin');
        $this->postJson('/api/auth/login', ['email' => $admin->email, 'password' => self::PASSWORD])->assertOk();
        $this->postJson('/api/auth/login', ['email' => $admin->email, 'password' => self::PASSWORD])->assertOk();
        Notification::assertSentToTimes($admin, SecurityNotice::class, 1);
    }

    public function test_changing_password_logs_out_other_devices(): void
    {
        $user = $this->user();
        $thief = $user->createToken('lama')->plainTextToken;
        $mine = $user->createToken('saya')->plainTextToken;

        $this->withToken($mine)->putJson('/api/profile', [
            'name' => 'Budi', 'whatsapp' => '081234567890', 'current_password' => self::PASSWORD, 'password' => 'Baru-sekali-88', 'password_confirmation' => 'Baru-sekali-88',
        ])->assertOk();

        $this->app['auth']->forgetGuards();
        $this->withToken($thief)->getJson('/api/auth/me')->assertUnauthorized();
        $this->app['auth']->forgetGuards();
        $this->withToken($mine)->getJson('/api/auth/me')->assertOk();
    }

    public function test_weak_passwords_and_link_names_are_rejected(): void
    {
        $base = ['email' => 'baru@contoh.test', 'whatsapp' => '081299998888', 'name' => 'Budi Santoso'];
        foreach (['password123', '12345678', 'hanyahuruf', 'baru2026x'] as $pw) {
            $email = $pw === 'baru2026x' ? 'baru2026@contoh.test' : $base['email'];
            $this->postJson('/api/auth/register', ['email' => $email] + $base + ['password' => $pw, 'password_confirmation' => $pw])
                ->assertStatus(422)->assertJsonValidationErrors('password');
        }
        // Nama berisi tautan akan terkirim sebagai email resmi Srawung ke korban.
        foreach (['[Klaim hadiah](http://jahat.test)', 'Kunjungi jahat.com', '<b>Budi</b>', 'https://x.test'] as $name) {
            $this->postJson('/api/auth/register', ['name' => $name] + $base + ['password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD])
                ->assertStatus(422)->assertJsonValidationErrors('name');
        }
        $this->postJson('/api/auth/register', ['name' => "Nur'aini Putri, S.Kom."] + $base + ['password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD])->assertCreated();
    }

    /* ---------------- Google ---------------- */

    public function test_attacker_cannot_pre_register_a_victims_email(): void
    {
        // Penyerang mendaftar duluan memakai email korban (belum terverifikasi) dan menyimpan tokennya.
        $squatted = $this->user('buyer', ['email' => 'korban@gmail.test', 'email_verified_at' => null]);
        $attackerToken = $squatted->createToken('x')->plainTextToken;

        $this->googleSays(['email' => 'korban@gmail.test', 'sub' => 'google-korban']);
        $this->postJson('/api/auth/google', ['credential' => 'idtoken'])->assertOk()->assertJsonPath('user.id', $squatted->id);

        $this->app['auth']->forgetGuards();
        $this->withToken($attackerToken)->getJson('/api/auth/me')->assertUnauthorized();
        $this->flushHeaders();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/auth/login', ['email' => 'korban@gmail.test', 'password' => self::PASSWORD])->assertStatus(422);
    }

    public function test_account_linked_to_one_google_id_cannot_be_taken_by_another(): void
    {
        $user = $this->user('buyer', ['email' => 'pemilik@gmail.test', 'google_id' => 'asli']);
        $this->googleSays(['email' => 'pemilik@gmail.test', 'sub' => 'palsu']);
        $this->postJson('/api/auth/google', ['credential' => 'idtoken'])->assertStatus(409);
        $this->assertSame('asli', $user->fresh()->google_id);
    }

    public function test_google_redirect_flow_requires_state_and_never_puts_a_token_in_the_url(): void
    {
        config(['services.google.client_id' => 'klien-uji']);
        $verifier = str_repeat('v', 64);
        $redirect = $this->get('/api/auth/google/redirect?challenge=' . hash('sha256', $verifier))->assertRedirect();
        parse_str(parse_url($redirect->headers->get('Location'), PHP_URL_QUERY), $q);
        $this->assertNotEmpty($q['state']);

        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['id_token' => 'x']),
            'oauth2.googleapis.com/tokeninfo*' => Http::response(['aud' => 'klien-uji', 'iss' => 'accounts.google.com', 'email_verified' => 'true', 'email' => 'g@contoh.test', 'sub' => 's1', 'name' => 'G']),
        ]);

        // Tanpa cookie state (login CSRF) → ditolak.
        $this->get('/api/auth/google/callback?code=abc&state=palsu')->assertRedirectContains('error=google_failed');

        $cb = $this->withUnencryptedCookie('google_state', $q['state'])->get("/api/auth/google/callback?code=abc&state={$q['state']}");
        $location = $cb->headers->get('Location');
        $this->assertStringNotContainsString('token=', $location);
        parse_str(parse_url($location, PHP_URL_QUERY), $done);

        // Kode dicuri orang lain: tanpa verifier tidak berguna, dan hangus setelah satu percobaan.
        $this->postJson('/api/auth/google/exchange', ['code' => $done['code'], 'verifier' => str_repeat('z', 64)])->assertStatus(422);
        $this->postJson('/api/auth/google/exchange', ['code' => $done['code'], 'verifier' => $verifier])->assertStatus(422);

        // Alur normal berhasil, satu kali.
        $r2 = $this->get('/api/auth/google/redirect?challenge=' . hash('sha256', $verifier));
        parse_str(parse_url($r2->headers->get('Location'), PHP_URL_QUERY), $q2);
        parse_str(parse_url($this->withUnencryptedCookie('google_state', $q2['state'])->get("/api/auth/google/callback?code=abc&state={$q2['state']}")->headers->get('Location'), PHP_URL_QUERY), $d2);
        $this->postJson('/api/auth/google/exchange', ['code' => $d2['code'], 'verifier' => $verifier])->assertOk()->assertJsonStructure(['token', 'user']);
        $this->postJson('/api/auth/google/exchange', ['code' => $d2['code'], 'verifier' => $verifier])->assertStatus(422);
    }

    /* ---------------- 2FA ---------------- */

    public function test_totp_matches_the_rfc_6238_reference_vector(): void
    {
        // Rahasia acuan RFC: "12345678901234567890" → T=59 dtk menghasilkan 94287082 (6 angka terakhir).
        $this->assertSame('287082', Totp::code('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', Totp::step(59)));
        $this->assertSame('081804', Totp::code('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', Totp::step(1111111109)));
    }

    public function test_two_factor_protects_admin_login_end_to_end(): void
    {
        $admin = $this->user('admin');
        $login = fn () => $this->postJson('/api/auth/login', ['email' => $admin->email, 'password' => self::PASSWORD]);
        $code = fn () => Totp::code($admin->fresh()->two_factor_secret, Totp::step());

        Sanctum::actingAs($admin);
        $this->postJson('/api/auth/two-factor/setup', ['password' => 'salah'])->assertStatus(422);
        $this->postJson('/api/auth/two-factor/setup', ['password' => self::PASSWORD])->assertOk()->assertJsonStructure(['secret', 'qr']);
        $this->postJson('/api/auth/two-factor/confirm', ['code' => '000000'])->assertStatus(422);
        $recovery = $this->postJson('/api/auth/two-factor/confirm', ['code' => $code()])->assertOk()->json('recovery_codes');
        $this->assertCount(8, $recovery);
        $this->assertStringNotContainsString($recovery[0], json_encode($admin->fresh()->getAttributes()), 'kode pemulihan tidak tersimpan polos');

        // Sandi benar saja tidak cukup.
        $this->app['auth']->forgetGuards();
        $res = $login()->assertOk()->assertJson(['two_factor' => true])->assertJsonMissingPath('token')->assertJsonMissingPath('user');
        $this->postJson('/api/auth/two-factor-challenge', ['challenge' => $res->json('challenge'), 'code' => '123456'])->assertStatus(422);

        $this->travel(31)->seconds();
        $used = $code();
        $this->postJson('/api/auth/two-factor-challenge', ['challenge' => $res->json('challenge'), 'code' => $used])->assertOk()->assertJsonStructure(['token']);

        // Kode yang sama & tantangan yang sama tidak bisa dipakai lagi.
        $again = $login()->json('challenge');
        $this->postJson('/api/auth/two-factor-challenge', ['challenge' => $again, 'code' => $used])->assertStatus(422);
        $this->postJson('/api/auth/two-factor-challenge', ['challenge' => $res->json('challenge'), 'code' => $recovery[0]])->assertStatus(422);

        // Kode pemulihan: sekali pakai.
        $this->postJson('/api/auth/two-factor-challenge', ['challenge' => $login()->json('challenge'), 'code' => $recovery[0]])->assertOk();
        $this->postJson('/api/auth/two-factor-challenge', ['challenge' => $login()->json('challenge'), 'code' => $recovery[0]])->assertStatus(422);
    }

    public function test_two_factor_challenge_dies_after_five_wrong_codes(): void
    {
        $admin = $this->user('admin', ['two_factor_confirmed_at' => now()]);
        $admin->forceFill(['two_factor_secret' => Totp::generateSecret()])->save();
        $challenge = $this->postJson('/api/auth/login', ['email' => $admin->email, 'password' => self::PASSWORD])->json('challenge');
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/two-factor-challenge', ['challenge' => $challenge, 'code' => '00000' . $i])->assertStatus(422);
        }
        $this->postJson('/api/auth/two-factor-challenge', ['challenge' => $challenge, 'code' => Totp::code($admin->two_factor_secret, Totp::step())])->assertStatus(422);
    }

    public function test_two_factor_secret_never_leaves_the_server(): void
    {
        $admin = $this->user('admin', ['two_factor_confirmed_at' => now()]);
        $admin->forceFill(['two_factor_secret' => Totp::generateSecret()])->save();
        Sanctum::actingAs($admin);
        $this->getJson('/api/auth/me')->assertOk()->assertJsonPath('user.two_factor_enabled', true)
            ->assertJsonMissingPath('user.two_factor_secret')->assertJsonMissingPath('user.two_factor_recovery');
        // Pembeli tidak memakai fitur ini.
        Sanctum::actingAs($this->user());
        $this->postJson('/api/auth/two-factor/setup', ['password' => self::PASSWORD])->assertForbidden();
    }

    /* ---------------- Unggahan ---------------- */

    public function test_html_disguised_as_a_cover_never_reaches_the_public_folder(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($creator = $this->user('creator'));
        CreatorProfile::create(['user_id' => $creator->id, 'display_name' => 'Kreator', 'terms_version' => CreatorTerms::VERSION, 'terms_accepted_at' => now()]);
        $evil = $this->rawUpload("GIF89a<html><script>alert(document.domain)</script></html>", 'sampul.html', 'image/gif');

        $this->post('/api/creator/books', ['title' => 'Jebakan', 'author' => 'x', 'synopsis' => 'x', 'price' => 1000, 'status' => 'published', 'cover' => $evil], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('cover');
        $this->assertSame([], Storage::disk('public')->allFiles());
    }

    public function test_decompression_bomb_is_refused_before_it_is_opened(): void
    {
        Storage::fake('local');
        $user = $this->user();
        $order = $this->order($user);
        Sanctum::actingAs($user);
        // Header PNG 50.000 × 50.000 px (10 GB di memori) dalam file < 100 byte.
        $ihdr = 'IHDR' . pack('NN', 50000, 50000) . "\x08\x06\x00\x00\x00";
        $png = "\x89PNG\r\n\x1a\n" . pack('N', 13) . $ihdr . pack('N', crc32($ihdr)) . pack('N', 0) . 'IEND' . pack('N', crc32('IEND'));

        $this->post("/api/orders/{$order->id}/proof", ['proof' => $this->rawUpload($png, 'bukti.png', 'image/png')], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonValidationErrors('proof');
        $this->assertSame('menunggu_pembayaran', $order->fresh()->status);
    }

    public function test_proof_extension_comes_from_content_and_is_served_sandboxed(): void
    {
        Storage::fake('local');
        $user = $this->user();
        $order = $this->order($user);
        Sanctum::actingAs($user);
        $this->post("/api/orders/{$order->id}/proof", ['proof' => $this->rawUpload($this->jpeg() . '<script>alert(1)</script>', 'bukti.html', 'text/html')], ['Accept' => 'application/json'])->assertOk();

        $proof = PaymentProof::firstOrFail();
        $this->assertStringEndsWith('.jpg', $proof->file_path);

        Sanctum::actingAs($this->user('admin'));
        $res = $this->get("/api/admin/orders/{$order->id}/proofs/{$proof->id}")->assertOk();
        $this->assertSame('image/jpeg', $res->headers->get('Content-Type'));
        $this->assertStringContainsString('sandbox', $res->headers->get('Content-Security-Policy'));
    }

    /* ---------------- Membaca ---------------- */

    public function test_blocked_reader_is_cut_off_immediately(): void
    {
        $user = $this->user();
        $book = $this->book();
        UserLibrary::create(['user_id' => $user->id, 'book_id' => $book->id, 'access_status' => 'active']);
        Sanctum::actingAs($user);
        $token = $this->postJson("/api/reader/{$book->slug}/session")->json('session_token');
        $this->assertDatabaseMissing('reading_sessions', ['session_token' => $token]); // hanya hash yang disimpan

        $this->app['auth']->forgetGuards();
        $this->withToken($token)->get("/api/reader/{$book->slug}/pages/1")->assertOk();
        $this->withToken($token)->get("/api/reader/{$book->slug}/pages/999")->assertNotFound();

        $this->flushHeaders();
        Sanctum::actingAs($this->user('admin'));
        $this->patchJson("/api/admin/users/{$user->id}/block")->assertOk();
        $this->app['auth']->forgetGuards();
        $this->withToken($token)->get("/api/reader/{$book->slug}/pages/1")->assertStatus(401);
        $this->assertFalse(ReadingSession::first()->is_active);
    }

    /* ---------------- Pesanan, kreator, pengaturan ---------------- */

    public function test_malformed_checkout_input_is_a_validation_error_not_a_crash(): void
    {
        Sanctum::actingAs($this->user());
        $this->postJson('/api/orders', ['book_ids' => [1], 'coupon_code' => ['x']])->assertStatus(422);
        $this->postJson('/api/orders', ['items' => [['apa' => 1]]])->assertStatus(404);
        $this->getJson('/api/books?search[]=x')->assertStatus(422);
        $this->postJson('/api/client-errors', ['message' => "baris1\nproduction.ERROR: palsu"])->assertNoContent();
    }

    public function test_unpaid_orders_are_capped(): void
    {
        $user = $this->user();
        for ($i = 0; $i < 10; $i++) {
            $this->order($user);
        }
        Sanctum::actingAs($user);
        $this->postJson('/api/orders', ['book_ids' => [$this->book()->id]])->assertStatus(422);
    }

    public function test_changing_payout_account_pauses_withdrawals(): void
    {
        $creator = $this->user('creator');
        CreatorProfile::create(['user_id' => $creator->id, 'display_name' => 'K', 'terms_version' => CreatorTerms::VERSION, 'payout_method' => 'bank', 'payout_provider' => 'BCA', 'payout_account' => '111', 'payout_holder' => 'Asli']);
        Sanctum::actingAs($creator);

        $this->putJson('/api/creator/profile', ['display_name' => 'K', 'payout_method' => 'bank', 'payout_provider' => 'BCA', 'payout_account' => '999', 'payout_holder' => 'Maling'])->assertOk();
        Notification::assertSentTo($creator, SecurityNotice::class);
        $this->postJson('/api/creator/payouts', ['amount' => 100000, 'agree' => true])->assertStatus(422)->assertJsonFragment(['message' => $this->app['translator']->get($this->responseMessage())]);
    }

    private function responseMessage(): string
    {
        $msg = $this->postJson('/api/creator/payouts', ['amount' => 100000, 'agree' => true])->json('message');
        $this->assertStringContainsString('Rekening pencairan baru saja diganti', $msg);

        return $msg;
    }

    public function test_every_admin_hears_about_payment_setting_changes(): void
    {
        $other = $this->user('admin');
        Sanctum::actingAs($this->user('admin'));
        $this->putJson('/api/admin/settings', ['settings' => ['qris_nmid' => 'ID999PENYERANG', 'admin_notification_email' => 'penyerang@contoh.test']])->assertOk();
        Notification::assertSentOnDemand(SecurityNotice::class, fn ($n, $channels, $to) => $to->routes['mail'] === strtolower($other->email));
    }

    public function test_internal_file_paths_are_not_public(): void
    {
        $book = $this->book(['source_file_path' => 'books/1/source.pdf']);
        $user = $this->user();
        UserLibrary::create(['user_id' => $user->id, 'book_id' => $book->id, 'access_status' => 'active']);
        $this->assertStringNotContainsString('source.pdf', $this->getJson('/api/books')->getContent());
        $this->assertStringNotContainsString('image_path', $this->getJson("/api/books/{$book->slug}")->getContent());
        Sanctum::actingAs($user);
        $this->assertStringNotContainsString('source.pdf', $this->getJson('/api/library')->assertOk()->getContent());
        Sanctum::actingAs($this->user('admin'));
        $this->assertStringContainsString('source.pdf', $this->getJson("/api/admin/books/{$book->id}")->getContent());
    }

    public function test_spreadsheet_formulas_are_neutralised_in_exports(): void
    {
        $buyer = $this->user('buyer', ['name' => '=HYPERLINK("http://jahat.test")']);
        $this->order($buyer, 'dikonfirmasi')->update(['confirmed_at' => now()]);
        Sanctum::actingAs($this->user('admin'));
        $csv = $this->get('/api/admin/reports/export')->streamedContent();
        $this->assertStringContainsString("'=HYPERLINK", $csv);
    }

    /* ---------------- Email ---------------- */

    public function test_user_text_cannot_inject_links_into_official_emails(): void
    {
        $user = $this->user();
        $order = $this->order($user);
        $proof = PaymentProof::create(['order_id' => $order->id, 'file_path' => 'x', 'status' => 'pending', 'buyer_note' => 'Cek [mutasi di sini](http://jahat.test/login)']);
        $html = (string) (new NewPaymentProofForAdmin($order, $proof))->toMail($this->user('admin'))->render();
        $this->assertStringNotContainsString('href="http://jahat.test', $html);
        $this->assertStringContainsString('mutasi di sini', $html);
    }

    public function test_public_forms_cannot_be_used_to_flood_someone_elses_inbox(): void
    {
        $payload = ['reporter_name' => 'Iseng', 'reporter_email' => 'korban@contoh.test', 'type' => array_key_first(\App\Models\BookReport::TYPES), 'relationship' => array_key_first(\App\Models\BookReport::RELATIONSHIPS), 'description' => str_repeat('spam ', 10), 'statement' => true];
        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/books/' . $this->book()->slug . '/report', $payload)->assertCreated();
        }
        Notification::assertSentOnDemandTimes(BookReportReceived::class, 2);
        $this->postJson('/api/books/' . $this->book()->slug . '/report', ['evidence_url' => 'javascript://%0aalert(1)'] + $payload)->assertStatus(422);
    }
}
