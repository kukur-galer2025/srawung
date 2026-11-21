<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\User;
use App\Models\UserLibrary;
use App\Services\BookSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * "Cari di dalam semua buku" (BM25) dan "Setelah buku ini, pembaca biasanya lanjut ke…" (Markov).
 */
class DiscoveryTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    /** @param list<string> $pages */
    private function bookWithPages(string $title, array $pages, int $preview = 2, string $status = 'published'): Book
    {
        $book = Book::create([
            'title' => $title,
            'slug' => str($title)->slug() . '-' . uniqid(),
            'author' => 'Tim Uji',
            'synopsis' => 'Buku uji.',
            'price' => 50000,
            'status' => $status,
            'total_pages' => count($pages),
            'preview_pages' => $preview,
        ]);
        foreach ($pages as $i => $text) {
            DB::table('book_pages')->insert([
                'book_id' => $book->id, 'page_number' => $i + 1, 'image_path' => "x/{$i}.jpg", 'text' => $text,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        app(BookSearch::class)->indexBook($book);

        return $book;
    }

    private function user(): User
    {
        return User::forceCreate([
            'name' => 'Pembaca', 'email' => fake()->unique()->safeEmail(), 'password' => 'password123',
            'role' => 'buyer', 'is_blocked' => false, 'email_verified_at' => now(),
        ]);
    }

    public function test_search_inside_ranks_books_corrects_typos_and_marks_free_pages(): void
    {
        $laravel = $this->bookWithPages('Belajar Laravel', [
            'Pengantar framework web modern.',
            'Bab Eloquent ORM: relasi hasMany dan belongsTo antartabel.',
            'Eloquent relasi lanjutan: eager loading untuk mencegah query N+1.',
            'Penutup.',
        ]);
        $sql = $this->bookWithPages('Dasar Database', ['Relasi antartabel memakai foreign key.', 'Normalisasi data.']);
        $draft = $this->bookWithPages('Draf Rahasia', ['Eloquent relasi di buku draf.'], 1, 'draft');

        $res = $this->getJson('/api/search/inside?q=eloquent relasi')->assertOk()->json();
        $this->assertSame($laravel->id, $res['books'][0]['id'], 'buku yang memuat semua kata di urutan teratas');
        $this->assertNotContains($draft->id, array_column($res['books'], 'id'), 'buku draf tidak ikut');
        $this->assertSame(2, $res['books'][0]['hits']);
        $this->assertTrue($res['books'][0]['pages'][0]['free'] || $res['books'][0]['pages'][1]['free']);
        $this->assertStringContainsStringIgnoringCase('eloquent', $res['books'][0]['pages'][0]['snippet']);

        // Salah ketik dikoreksi.
        $typo = $this->getJson('/api/search/inside?q=elokuent')->assertOk()->json();
        $this->assertSame('eloquent', $typo['corrected']);
        $this->assertSame($laravel->id, $typo['books'][0]['id']);

        // Pemilik buku diberi tanda → tautan langsung ke reader.
        $u = $this->user();
        UserLibrary::create(['user_id' => $u->id, 'book_id' => $laravel->id, 'access_status' => 'active']);
        Sanctum::actingAs($u);
        $this->getJson('/api/search/inside?q=eloquent')->assertJsonPath('books.0.is_owned', true);

        $this->getJson('/api/search/inside?q=x')->assertStatus(422);
        $this->assertNotNull($sql);
    }

    public function test_next_reads_prefers_series_then_reader_transitions_then_similar(): void
    {
        $books = Book::where('status', 'published')->orderBy('id')->take(4)->get();
        [$a, $b, $c, $d] = $books->all();

        // Tanpa data: cadangan kemiripan topik.
        $first = $this->getJson("/api/books/{$a->slug}/next")->assertOk()->json();
        $this->assertNotEmpty($first);
        $this->assertSame('similar', $first[0]['kind']);

        // Dua pembaca membeli A lalu C → transisi nyata.
        foreach ([1, 2] as $_) {
            $u = $this->user();
            UserLibrary::create(['user_id' => $u->id, 'book_id' => $a->id, 'access_status' => 'active', 'created_at' => now()->subDays(3)]);
            UserLibrary::create(['user_id' => $u->id, 'book_id' => $c->id, 'access_status' => 'active', 'created_at' => now()->subDay()]);
        }
        $next = $this->getJson("/api/books/{$a->slug}/next")->assertOk()->json();
        $this->assertSame($c->id, $next[0]['id']);
        $this->assertSame('readers', $next[0]['kind']);
        $this->assertNull($next[0]['percent'], 'persentase baru tampil setelah ≥ 5 pembaca');

        // Seri pilihan admin selalu di urutan pertama.
        $a->update(['next_book_id' => $d->id]);
        $next = $this->getJson("/api/books/{$a->slug}/next")->assertOk()->json();
        $this->assertSame($d->id, $next[0]['id']);
        $this->assertSame('series', $next[0]['kind']);
        $this->assertSame($c->id, $next[1]['id']);

        // Admin tidak bisa memilih buku itu sendiri sebagai lanjutan.
        Sanctum::actingAs(User::where('role', 'admin')->first());
        $this->postJson("/api/admin/books/{$a->id}", ['_method' => 'PUT', 'title' => $a->title, 'author' => $a->author, 'synopsis' => 'x', 'price' => $a->price, 'status' => 'published', 'next_book_id' => $a->id])
            ->assertStatus(422);
        $this->assertNotNull($b);
    }
}
