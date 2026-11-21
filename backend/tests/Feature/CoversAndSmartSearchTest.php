<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Category;
use App\Models\User;
use App\Models\UserLibrary;
use App\Services\CoverImage;
use App\Services\SmartSearch;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Varian sampul + placeholder (tampil instan) dan pencarian instan yang dipersonalisasi. */
class CoversAndSmartSearchTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private function cover(int $w = 900, int $h = 1300): UploadedFile
    {
        $img = imagecreatetruecolor($w, $h);
        imagefill($img, 0, 0, imagecolorallocate($img, 30, 60, 120));
        imagefilledrectangle($img, 50, 50, 400, 600, imagecolorallocate($img, 240, 180, 40));
        ob_start();
        imagejpeg($img, null, 92);

        return UploadedFile::fake()->createWithContent('sampul.jpg', (string) ob_get_clean());
    }

    private function book(string $title, ?int $categoryId = null, array $attrs = []): Book
    {
        return Book::create([
            'title' => $title, 'slug' => str($title)->slug() . '-' . uniqid(), 'author' => 'Penulis Uji', 'synopsis' => 'Buku uji.',
            'price' => 50000, 'status' => 'published', 'total_pages' => 100, 'category_id' => $categoryId, ...$attrs,
        ]);
    }

    /* ------------------------------ Sampul ------------------------------ */

    public function test_cover_variants_and_placeholder_are_built_and_replaced(): void
    {
        Storage::fake('public');
        $book = $this->book('Kriptografi Modern', null, ['cover_path' => CoverImage::store($this->cover())]);
        $base = preg_replace('/\.webp$/', '', $book->cover_path);

        $this->assertSame([160, 320, 640], $book->cover_meta['w']);
        foreach ([160, 320, 640] as $w) {
            Storage::disk('public')->assertExists("{$base}-{$w}.webp");
            $this->assertSame($w, getimagesizefromstring(Storage::disk('public')->get("{$base}-{$w}.webp"))[0]);
        }
        $this->assertStringStartsWith('data:image/webp;base64,', $book->cover_placeholder);
        $this->assertLessThan(600, strlen($book->cover_placeholder), 'placeholder harus mungil agar bisa disisipkan di HTML');
        $this->assertStringContainsString('-320.webp 320w', $book->cover_srcset);

        $json = $this->getJson('/api/books?search=kriptografi')->assertOk()->json('data.0');
        $this->assertArrayHasKey('cover_srcset', $json);
        $this->assertArrayNotHasKey('cover_meta', $json);
        $this->getJson("/api/books/{$book->slug}")->assertJsonPath('cover_placeholder', $book->cover_placeholder);

        // Ganti sampul → varian lama dihapus, varian baru dibuat.
        $book->update(['cover_path' => CoverImage::store($this->cover(600, 900))]);
        Storage::disk('public')->assertMissing("{$base}-320.webp");
        Storage::disk('public')->assertExists(preg_replace('/\.webp$/', '', $book->cover_path) . '-320.webp');

        // Backfill untuk sampul lama.
        Book::whereKey($book->id)->update(['cover_meta' => null]);
        $this->artisan('amania:cover-variants')->assertSuccessful();
        $this->assertSame([160, 320, 640], $book->fresh()->cover_meta['w']);
    }

    /* ------------------------- Pencarian pintar ------------------------- */

    public function test_suggestions_are_reranked_by_reader_interest(): void
    {
        $sec = Category::create(['name' => 'Keamanan Siber', 'slug' => 'keamanan-siber']);
        $math = Category::create(['name' => 'Matematika Diskrit', 'slug' => 'matematika-diskrit']);
        $mathBook = $this->book('Kriptografi untuk Matematikawan', $math->id);
        $secBook = $this->book('Kriptografi untuk Praktisi', $sec->id);

        // Tamu tanpa sinyal: urutan murni relevansi teks (keduanya setara), tidak dipersonalisasi.
        $guest = $this->getJson('/api/search/suggest?q=kriptografi')->assertOk();
        $this->assertFalse($guest->json('personalized'));
        $this->assertEqualsCanonicalizing([$mathBook->id, $secBook->id], array_column($guest->json('books'), 'id'));

        // Pembaca yang memiliki buku keamanan siber → buku keamanan siber naik ke atas.
        $reader = User::forceCreate(['name' => 'Rani', 'email' => 'rani@example.com', 'password' => 'x', 'role' => 'buyer', 'is_blocked' => false, 'email_verified_at' => now()]);
        $owned = $this->book('Dasar Keamanan Jaringan', $sec->id);
        UserLibrary::create(['user_id' => $reader->id, 'book_id' => $owned->id, 'access_status' => 'active', 'last_read_page' => 80]);
        Sanctum::actingAs($reader);
        $res = $this->getJson('/api/search/suggest?q=kriptografi')->assertOk();
        $this->assertTrue($res->json('personalized'));
        $this->assertSame($secBook->id, $res->json('books.0.id'));
        $this->assertContains($res->json('books.0.reason'), ['Mirip buku yang Anda minati', 'Sesuai minat Anda: Keamanan Siber']);

        // Tamu juga bisa dipersonalisasi lewat sinyal dari perangkatnya (riwayat lihat).
        $this->app['auth']->forgetGuards();
        $viaSeen = $this->getJson("/api/search/suggest?q=kriptografi&seen={$owned->id}")->assertOk();
        $this->assertSame($secBook->id, $viaSeen->json('books.0.id'));
    }

    public function test_click_feedback_lifts_the_book_people_pick(): void
    {
        $a = $this->book('Kriptografi Klasik');
        $b = $this->book('Kriptografi Kuantum');

        foreach (range(1, 6) as $i) {
            SmartSearch::recordClick('Kriptografi ', $b->id, "pengunjung-{$i}");
        }
        SmartSearch::recordClick('kriptografi', $b->id, 'pengunjung-1'); // pengunjung sama, hari sama → tidak dihitung
        $this->assertSame(6, (int) DB::table('search_clicks')->where('query', 'kriptografi')->where('book_id', $b->id)->value('clicks'));

        $res = $this->getJson('/api/search/suggest?q=kriptografi')->assertOk();
        $this->assertSame($b->id, $res->json('books.0.id'));
        $this->assertSame('Paling sering dipilih untuk pencarian ini', $res->json('books.0.reason'));
        $this->assertNotNull($a);

        $this->postJson('/api/search/click', ['q' => 'kriptografi', 'book_id' => $a->id])->assertNoContent();
        $this->assertSame(1, (int) DB::table('search_clicks')->where('book_id', $a->id)->value('clicks'));
    }

    public function test_suggest_offers_typo_fix_categories_completions_and_discover_panel(): void
    {
        $cat = Category::create(['name' => 'Kriptologi', 'slug' => 'kriptologi']);
        $this->book('Kriptografi Terapan', $cat->id);
        DB::table('search_query_daily')->insert([
            ['date' => now()->toDateString(), 'query' => 'kriptografi terapan', 'searches' => 9, 'results' => 1, 'last_searched_at' => now()],
            ['date' => now()->toDateString(), 'query' => 'kr', 'searches' => 50, 'results' => 3, 'last_searched_at' => now()],
            ['date' => now()->toDateString(), 'query' => 'xyzzy', 'searches' => 20, 'results' => 0, 'last_searched_at' => now()],
        ]);
        Cache::forget('search:trending-queries');

        $res = $this->getJson('/api/search/suggest?q=kriptograpi')->assertOk();
        $this->assertSame('kriptografi', $res->json('corrected'));
        $this->assertSame('Kriptografi Terapan', $res->json('books.0.title'));

        $this->assertSame('kriptologi', $this->getJson('/api/search/suggest?q=kripto')->json('categories.0.slug'));
        $this->assertContains('kriptografi terapan', $this->getJson('/api/search/suggest?q=kripto')->json('queries'));

        $empty = $this->getJson('/api/search/suggest')->assertOk();
        $this->assertContains('kriptografi terapan', $empty->json('trending'));
        $this->assertNotContains('kr', $empty->json('trending'), 'potongan ketikan pendek tidak ditampilkan');
        $this->assertNotContains('xyzzy', $empty->json('trending'), 'pencarian tanpa hasil tidak dipromosikan');
        $this->assertNotEmpty($empty->json('for_you'));
        $this->assertNotEmpty($empty->json('categories'));
    }
}
