<?php

namespace Tests\Feature;

use App\Models\AssistantMessage;
use App\Models\Book;
use App\Models\BookPage;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\PaymentProof;
use App\Models\User;
use App\Models\UserLibrary;
use App\Models\Wishlist;
use App\Services\Assistant\AssistantTools;
use App\Services\BookSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Kanca: alat pribadi (pesanan, perpustakaan), konteks halaman, cari isi buku, streaming, penilaian & laporan. */
class RoboNiaPlusTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private const GEMINI = 'https://gemini.test/v1/chat/completions';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.assistant.providers' => [
            ['name' => 'gemini', 'url' => 'https://gemini.test/v1', 'key' => 'g', 'model' => 'gemini-test', 'reasoning_effort' => null],
            ['name' => 'groq', 'url' => 'https://groq.test/v1', 'key' => 'q', 'model' => 'groq-test', 'reasoning_effort' => null],
        ]]);
        Http::preventStrayRequests();
    }

    private function user(string $name = 'Sari Wulandari'): User
    {
        return User::forceCreate([
            'name' => $name, 'email' => fake()->unique()->safeEmail(), 'password' => 'password123',
            'role' => 'buyer', 'is_blocked' => false, 'email_verified_at' => now(),
        ]);
    }

    private static function completion(?string $text, array $calls = []): array
    {
        $msg = ['role' => 'assistant', 'content' => $text];
        if ($calls) {
            $msg['tool_calls'] = $calls;
        }

        return ['choices' => [['message' => $msg, 'finish_reason' => $calls ? 'tool_calls' : 'stop']], 'usage' => ['prompt_tokens' => 10, 'completion_tokens' => 5]];
    }

    private static function toolCall(string $name, array $args = [], string $id = 'c1'): array
    {
        return ['id' => $id, 'type' => 'function', 'function' => ['name' => $name, 'arguments' => json_encode($args)]];
    }

    /** @param list<array> $chunks */
    private static function sse(array $chunks): string
    {
        return implode('', array_map(fn ($c) => 'data: ' . json_encode($c) . "\n\n", $chunks)) . "data: [DONE]\n\n";
    }

    private static function ask(string $q, array $extra = []): array
    {
        return ['messages' => [['role' => 'user', 'content' => $q]], ...$extra];
    }

    /* --------------------------- Alat pribadi --------------------------- */

    public function test_personal_tools_are_offered_only_to_logged_in_users(): void
    {
        Http::fake([self::GEMINI => Http::response(self::completion('Halo!'))]);

        $this->postJson('/api/assistant/chat', self::ask('pesanan saya?'))->assertOk();
        Sanctum::actingAs($this->user());
        $this->postJson('/api/assistant/chat', self::ask('pesanan saya?'))->assertOk();

        $requests = Http::recorded()->map(fn ($p) => $p[0])->values();
        $names = fn (HttpRequest $r) => array_column(array_column($r['tools'], 'function'), 'name');
        $this->assertNotContains('get_my_orders', $names($requests[0]));
        $this->assertStringContainsString('tamu', $requests[0]['messages'][0]['content']);
        $this->assertContains('get_my_orders', $names($requests[1]));
        $this->assertStringContainsString('"Sari"', $requests[1]['messages'][0]['content']);

        // Dicek ulang di sisi server: tanpa pengguna, alat pribadi menolak.
        $this->assertArrayHasKey('error', (new AssistantTools())->run('get_my_orders', []));
    }

    public function test_my_orders_returns_only_own_orders_with_next_step(): void
    {
        $book = Book::where('status', 'published')->firstOrFail();
        $me = $this->user();
        $other = $this->user('Orang Lain');
        $mine = Order::create(['order_number' => 'AMN-SAYA-1', 'user_id' => $me->id, 'total' => 79000, 'status' => 'ditolak', 'payment_deadline' => now()->addDay()]);
        OrderItem::create(['order_id' => $mine->id, 'book_id' => $book->id, 'price' => 79000]);
        PaymentProof::create(['order_id' => $mine->id, 'file_path' => 'x.jpg', 'status' => 'rejected', 'rejection_reason' => 'Nominal tidak sesuai.']);
        Order::create(['order_number' => 'AMN-ORANGLAIN-1', 'user_id' => $other->id, 'total' => 50000, 'status' => 'menunggu_pembayaran', 'payment_deadline' => now()->addDay()]);

        $tools = (new AssistantTools())->forUser($me);
        $out = $tools->run('get_my_orders', []);
        $this->assertCount(1, $out['pesanan']);
        $this->assertSame('AMN-SAYA-1', $out['pesanan'][0]['nomor']);
        $this->assertSame('Bukti pembayaran ditolak', $out['pesanan'][0]['status']);
        $this->assertStringContainsString('Nominal tidak sesuai.', $out['pesanan'][0]['langkah_berikutnya']);
        $this->assertStringContainsString('/pesanan/AMN-SAYA-1/bayar', $out['pesanan'][0]['langkah_berikutnya']);

        // Nomor pesanan milik orang lain tidak bisa diintip.
        $this->assertSame([], $tools->run('get_my_orders', ['order_number' => 'AMN-ORANGLAIN-1'])['pesanan']);
    }

    public function test_my_library_shows_progress_and_wishlist(): void
    {
        $me = $this->user();
        [$owned, $wished] = Book::where('status', 'published')->orderBy('id')->take(2)->get()->all();
        $owned->update(['total_pages' => 200]);
        UserLibrary::create(['user_id' => $me->id, 'book_id' => $owned->id, 'access_status' => 'active', 'last_read_page' => 90, 'last_read_at' => now()->subDay()]);
        Wishlist::create(['user_id' => $me->id, 'book_id' => $wished->id]);

        $out = (new AssistantTools())->forUser($me)->run('get_my_library', []);
        $this->assertStringStartsWith('45%', $out['perpustakaan'][0]['progres']);
        $this->assertSame("/baca/{$owned->slug}", $out['perpustakaan'][0]['url_baca']);
        $this->assertSame($wished->slug, $out['wishlist'][0]['slug']);
    }

    /* ------------------------ Konteks & isi buku ------------------------ */

    public function test_page_context_is_given_to_the_model(): void
    {
        $book = Book::where('status', 'published')->firstOrFail();
        Http::fake([self::GEMINI => Http::response(self::completion('Cocok untuk pemula.'))]);

        $this->postJson('/api/assistant/chat', self::ask('buku ini cocok untuk pemula?', ['book_slug' => $book->slug]))->assertOk();
        Http::assertSent(fn (HttpRequest $r) => str_contains($r['messages'][0]['content'], "slug: {$book->slug}"));
        $this->assertSame($book->slug, AssistantMessage::latest('id')->value('page_book'));
    }

    public function test_inside_search_gives_pages_and_chapters_without_leaking_paid_text(): void
    {
        $book = Book::create([
            'title' => 'Seni Kriptografi', 'slug' => 'seni-kriptografi', 'author' => 'X', 'synopsis' => 'x', 'price' => 50000,
            'status' => 'published', 'total_pages' => 40, 'preview_pages' => 3,
        ]);
        $book->forceFill(['toc' => [['title' => 'Bab 1 Pengantar', 'page' => 1, 'level' => 1], ['title' => 'Bab 4 Enigma', 'page' => 20, 'level' => 1]]])->save();
        BookPage::forceCreate(['book_id' => $book->id, 'page_number' => 2, 'image_path' => 'p2.jpg', 'text' => 'Pengantar singkat tentang mesin enigma dan sejarahnya.']);
        BookPage::forceCreate(['book_id' => $book->id, 'page_number' => 22, 'image_path' => 'p22.jpg', 'text' => 'Rahasia lengkap cara kerja rotor mesin enigma beserta kuncinya.']);
        app(BookSearch::class)->indexBook($book);

        $out = (new AssistantTools())->run('search_inside_books', ['query' => 'enigma']);
        $pages = collect($out['buku'][0]['halaman'])->keyBy('halaman');
        $this->assertSame('Bab 4 Enigma', $pages[22]['bab']);
        $this->assertNull($pages[22]['cuplikan'], 'isi halaman berbayar tidak boleh dikirim');
        $this->assertNotNull($pages[2]['cuplikan']);
        $this->assertSame('/buku/seni-kriptografi?halaman=2', $pages[2]['url']);

        // Pemilik buku boleh melihat cuplikan & langsung diarahkan ke pembaca.
        $me = $this->user();
        UserLibrary::create(['user_id' => $me->id, 'book_id' => $book->id, 'access_status' => 'active']);
        $owned = collect((new AssistantTools())->forUser($me)->run('search_inside_books', ['query' => 'enigma'])['buku'][0]['halaman'])->keyBy('halaman');
        $this->assertNotNull($owned[22]['cuplikan']);
        $this->assertSame('/baca/seni-kriptografi?halaman=22', $owned[22]['url']);
    }

    /* ----------------------------- Streaming ----------------------------- */

    public function test_streaming_sends_status_deltas_and_done_with_message_id(): void
    {
        $book = Book::where('status', 'published')->firstOrFail();
        Http::fake([self::GEMINI => Http::sequence()
            ->push(self::sse([
                ['choices' => [['delta' => ['tool_calls' => [['index' => 0, 'id' => 't1', 'type' => 'function', 'function' => ['name' => 'search_books', 'arguments' => '{"que']]]]]]],
                ['choices' => [['delta' => ['tool_calls' => [['index' => 0, 'function' => ['arguments' => 'ry":"' . addslashes($book->title) . '"}']]]], 'finish_reason' => 'tool_calls']]],
            ]), 200, ['Content-Type' => 'text/event-stream'])
            ->push(self::sse([
                ['choices' => [['delta' => ['content' => 'Coba ']]]],
                ['choices' => [['delta' => ['content' => "[{$book->title}](/buku/{$book->slug})."]]]],
                ['choices' => [['delta' => [], 'finish_reason' => 'stop']], 'usage' => ['prompt_tokens' => 30, 'completion_tokens' => 9]],
            ]), 200, ['Content-Type' => 'text/event-stream']),
        ]);

        $res = $this->post('/api/assistant/chat', self::ask('buku python?', ['stream' => true, 'session_id' => 'sesi-1']), ['Accept' => 'text/event-stream']);
        $res->assertOk();
        $this->assertStringStartsWith('text/event-stream', $res->headers->get('Content-Type'));
        $events = $this->events($res->streamedContent());

        $this->assertSame('Mencari di katalog…', $events['status'][0]['text']);
        $this->assertSame(['Coba ', "[{$book->title}](/buku/{$book->slug})."], array_column($events['delta'], 'text'));
        $done = $events['done'][0];
        $this->assertSame($book->slug, $done['books'][0]['slug']);

        // Argumen alat yang terpotong-potong dirakit ulang dengan benar.
        $second = Http::recorded()[1][0];
        $this->assertSame(['query' => $book->title], json_decode($second['messages'][2]['tool_calls'][0]['function']['arguments'], true));

        $log = AssistantMessage::findOrFail($done['message_id']);
        $this->assertSame(['search_books'], $log->tools);
        $this->assertFalse($log->failed);
    }

    public function test_stream_restarts_cleanly_when_provider_fails_midway(): void
    {
        Http::fake([
            self::GEMINI => Http::sequence()
                ->push(self::sse([
                    ['choices' => [['delta' => ['content' => 'Sebentar, saya cek… ', 'tool_calls' => [['index' => 0, 'id' => 't1', 'type' => 'function', 'function' => ['name' => 'list_categories', 'arguments' => '{}']]]], 'finish_reason' => 'tool_calls']]],
                ]), 200)
                ->push('kuota habis', 429),
            'https://groq.test/v1/chat/completions' => Http::response(self::sse([['choices' => [['delta' => ['content' => 'Ada 4 kategori.'], 'finish_reason' => 'stop']]]]), 200),
        ]);

        $events = $this->events($this->post('/api/assistant/chat', self::ask('kategori apa saja?', ['stream' => true]))->streamedContent());
        $this->assertArrayHasKey('restart', $events);
        $this->assertSame('Ada 4 kategori.', $events['done'][0]['reply']);
    }

    /** @return array<string, list<array>> */
    private function events(string $raw): array
    {
        $out = [];
        foreach (preg_split("/\n\n/", trim($raw)) as $block) {
            if (preg_match('/^event: (\w+)\ndata: (.*)$/s', $block, $m)) {
                $out[$m[1]][] = json_decode($m[2], true);
            }
        }

        return $out;
    }

    /* ------------------------ Penilaian & laporan ------------------------ */

    public function test_feedback_and_admin_report(): void
    {
        Http::fake([self::GEMINI => Http::sequence()
            ->push(self::completion(null, [self::toolCall('search_books', ['query' => 'xyzzy quuxor'])]))
            ->push(self::completion('Maaf, buku itu belum tersedia.'))
            ->push(self::completion('Caranya: bayar dengan QRIS.')),
        ]);

        $failed = $this->postJson('/api/assistant/chat', self::ask('ada buku xyzzy quuxor?', ['session_id' => 'sesi-A']))->assertOk()->json('message_id');
        $ok = $this->postJson('/api/assistant/chat', self::ask('cara bayar pesanan gimana?', ['session_id' => 'sesi-A']))->assertOk()->json('message_id');

        $this->assertTrue(AssistantMessage::find($failed)->failed);
        $this->assertSame(['xyzzy quuxor'], AssistantMessage::find($failed)->missing);

        // Hanya obrolan yang sama yang boleh menilai.
        $this->postJson('/api/assistant/feedback', ['message_id' => $ok, 'session_id' => 'sesi-LAIN', 'rating' => -1])->assertNotFound();
        $this->postJson('/api/assistant/feedback', ['message_id' => $ok, 'session_id' => 'sesi-A', 'rating' => 1])->assertOk();
        $this->postJson('/api/assistant/feedback', ['message_id' => $failed, 'session_id' => 'sesi-A', 'rating' => -1, 'feedback' => 'Tidak menjawab'])->assertOk();

        Sanctum::actingAs($this->user());
        $this->getJson('/api/admin/assistant-report')->assertForbidden();

        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());
        $r = $this->getJson('/api/admin/assistant-report?days=7')->assertOk();
        $this->assertSame(2, $r->json('total'));
        $this->assertSame(50, $r->json('satisfaction'));
        $this->assertSame(50, $r->json('failed_rate'));
        $this->assertSame('xyzzy quuxor', $r->json('missing.0.query'));
        $this->assertSame('Tidak menjawab', $r->json('disliked.0.feedback'));
        $this->assertContains('bayar', array_column($r->json('topics'), 'word'));
        $this->assertArrayNotHasKey('session_id', $r->json('disliked.0'));
    }
}
