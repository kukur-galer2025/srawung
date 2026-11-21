<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Coupon;
use App\Services\Assistant\AssistantTools;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Asisten Srawung: alat katalog hanya-baca, loop alat, cadangan penyedia, dan pengaman endpoint publik. */
class AssistantTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private const GEMINI = 'https://gemini.test/v1/chat/completions';
    private const GROQ = 'https://groq.test/v1/chat/completions';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.assistant.providers' => [
            ['name' => 'gemini', 'url' => 'https://gemini.test/v1', 'key' => 'g-test', 'model' => 'gemini-test', 'reasoning_effort' => 'low'],
            ['name' => 'groq', 'url' => 'https://groq.test/v1', 'key' => 'q-test', 'model' => 'groq-test', 'reasoning_effort' => null],
        ]]);
        Http::preventStrayRequests();
    }

    /** Respons /chat/completions berformat OpenAI. */
    private static function completion(?string $text, array $toolCalls = [], string $finish = 'stop'): array
    {
        $message = ['role' => 'assistant', 'content' => $text];
        if ($toolCalls) {
            $message['tool_calls'] = $toolCalls;
            $finish = 'tool_calls';
        }

        return [
            'choices' => [['index' => 0, 'message' => $message, 'finish_reason' => $finish]],
            'usage' => ['prompt_tokens' => 100, 'completion_tokens' => 20],
        ];
    }

    private static function ask(string $text = 'Halo'): array
    {
        return ['messages' => [['role' => 'user', 'content' => $text]]];
    }

    public function test_disabled_without_any_api_key(): void
    {
        config(['services.assistant.providers' => [['name' => 'gemini', 'url' => 'https://x', 'key' => null, 'model' => 'm']]]);
        $this->getJson('/api/assistant/status')->assertOk()->assertJson(['enabled' => false]);
        $this->postJson('/api/assistant/chat', self::ask())->assertStatus(503)->assertJson(['code' => 'assistant_disabled']);
    }

    public function test_tool_loop_answers_from_catalog_and_returns_linked_book_cards(): void
    {
        $book = Book::where('status', 'published')->firstOrFail();
        Http::fake([self::GEMINI => Http::sequence()
            ->push(self::completion(null, [[
                'id' => 'call_1', 'type' => 'function',
                'function' => ['name' => 'search_books', 'arguments' => json_encode(['query' => $book->title])],
                'extra_content' => ['google' => ['thought_signature' => 'sig123']],
            ]]))
            ->push(self::completion("Coba [{$book->title}](/buku/{$book->slug}) — cocok untuk pemula.")),
        ]);

        $this->postJson('/api/assistant/chat', self::ask('Ada buku untuk pemula?'))
            ->assertOk()
            ->assertJsonPath('books.0.slug', $book->slug)
            ->assertJsonCount(1, 'books');

        $requests = Http::recorded()->map(fn ($pair) => $pair[0]);
        $this->assertCount(2, $requests);

        /** @var HttpRequest $first */
        $first = $requests[0];
        $this->assertSame('Bearer g-test', $first->header('Authorization')[0]);
        $this->assertSame('system', $first['messages'][0]['role']);
        $this->assertSame('low', $first['reasoning_effort']);
        $this->assertSame('search_books', $first['tools'][0]['function']['name']);

        // Putaran kedua: panggilan alat dikirim balik utuh (termasuk thought signature), lalu hasil alat dengan tool_call_id.
        $messages = $requests[1]['messages'];
        $assistant = $messages[count($messages) - 2];
        $tool = end($messages);
        $this->assertSame('sig123', $assistant['tool_calls'][0]['extra_content']['google']['thought_signature']);
        $this->assertSame('tool', $tool['role']);
        $this->assertSame('call_1', $tool['tool_call_id']);
        $this->assertStringContainsString($book->slug, $tool['content']);
    }

    public function test_falls_back_to_next_provider_when_quota_runs_out(): void
    {
        Http::fake([
            self::GEMINI => Http::response(['error' => ['message' => 'Resource exhausted']], 429),
            self::GROQ => Http::response(self::completion('Halo! Ada yang bisa saya bantu?')),
        ]);

        $this->postJson('/api/assistant/chat', self::ask())
            ->assertOk()->assertJsonPath('reply', 'Halo! Ada yang bisa saya bantu?');

        // Penyedia tanpa reasoning_effort tidak dikirimi parameter itu.
        Http::assertSent(fn (HttpRequest $r) => $r->url() === self::GROQ && !isset($r['reasoning_effort']));
    }

    public function test_basic_mode_searches_catalog_when_all_providers_fail(): void
    {
        Http::fake(['*' => Http::response('down', 503)]);
        $book = Book::where('status', 'published')->firstOrFail();
        $keyword = collect(preg_split('/\s+/', mb_strtolower($book->title)))->first(fn ($w) => mb_strlen($w) >= 5);

        $this->postJson('/api/assistant/chat', self::ask("Ada buku tentang {$keyword}?"))
            ->assertOk()
            ->assertJson(fn ($j) => $j->where('reply', fn ($r) => str_contains($r, 'sedang penuh') && str_contains($r, '/buku/'))->etc())
            ->assertJsonPath('books.0.slug', fn ($slug) => is_string($slug));

        $this->postJson('/api/assistant/chat', self::ask('halo'))
            ->assertOk()->assertJsonPath('books', [])
            ->assertJson(fn ($j) => $j->where('reply', fn ($r) => str_contains($r, 'wa.me'))->etc());
    }

    public function test_content_filter_gets_polite_reply(): void
    {
        Http::fake([self::GEMINI => Http::response(self::completion(null, [], 'content_filter'))]);
        $this->postJson('/api/assistant/chat', self::ask('x'))
            ->assertOk()->assertJsonPath('books', [])
            ->assertJson(fn ($j) => $j->where('reply', fn ($r) => str_contains($r, 'tidak bisa membantu'))->etc());
    }

    public function test_input_is_validated_and_rate_limited(): void
    {
        Http::fake([self::GEMINI => Http::response(self::completion('Oke'))]);

        $this->postJson('/api/assistant/chat', ['messages' => [['role' => 'assistant', 'content' => 'Halo']]])->assertStatus(422);
        $this->postJson('/api/assistant/chat', self::ask(str_repeat('a', 601)))->assertStatus(422);

        config(['services.assistant.daily_limit' => 2]);
        $this->postJson('/api/assistant/chat', self::ask('satu'))->assertOk();
        $this->postJson('/api/assistant/chat', self::ask('dua'))->assertOk();
        $this->postJson('/api/assistant/chat', self::ask('tiga'))->assertStatus(429);
    }

    public function test_tools_expose_only_public_data(): void
    {
        $draft = Book::create([
            'title' => 'Naskah Rahasia Belum Terbit', 'slug' => 'naskah-rahasia', 'author' => 'X', 'synopsis' => 'x',
            'price' => 10000, 'status' => 'draft',
        ]);
        Coupon::create(['code' => 'RAHASIA', 'type' => 'percent', 'value' => 50, 'is_public' => false]);
        Coupon::create(['code' => 'PUBLIK5', 'type' => 'percent', 'value' => 5, 'is_public' => true]);

        $tools = new AssistantTools();
        $found = $tools->run('search_books', ['query' => 'Naskah Rahasia']);
        $this->assertNotContains($draft->slug, array_column($found['buku'], 'slug'), 'buku draf tidak boleh muncul');
        $this->assertArrayHasKey('error', $tools->run('get_book_details', ['slug' => $draft->slug]));

        $codes = array_column($tools->run('get_promotions', [])['kupon_publik'], 'kode');
        $this->assertContains('PUBLIK5', $codes);
        $this->assertNotContains('RAHASIA', $codes);

        $this->assertArrayHasKey('error', $tools->run('hapus_semua_buku', []));
    }
}
