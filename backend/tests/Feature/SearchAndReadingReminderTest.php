<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\User;
use App\Models\UserLibrary;
use App\Notifications\ContinueReadingReminder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Pencarian katalog berperingkat (BM25F + salah ketik) dan pengingat "lanjutkan membaca". */
class SearchAndReadingReminderTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private function book(string $title, array $attrs = []): Book
    {
        return Book::create([
            'title' => $title,
            'slug' => str($title)->slug() . '-' . fake()->unique()->numberBetween(100, 999),
            'author' => 'Penulis Uji',
            'synopsis' => 'Buku uji.',
            'price' => 50000,
            'status' => 'published',
            'total_pages' => 200,
            ...$attrs,
        ]);
    }

    private function user(array $attrs = []): User
    {
        return User::forceCreate([
            'name' => 'Dewi Lestari',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password123',
            'role' => 'buyer',
            'is_blocked' => false,
            'email_verified_at' => now(),
            ...$attrs,
        ]);
    }

    private function slugs(string $url): array
    {
        return array_column($this->getJson($url)->assertOk()->json('data'), 'slug');
    }

    /* ---------------------------- Pencarian ---------------------------- */

    public function test_title_match_outranks_synopsis_mention(): void
    {
        $mention = $this->book('Statistika Terapan', ['synopsis' => 'Dilengkapi contoh kode kriptografi untuk latihan.']);
        $title = $this->book('Kriptografi Modern');

        $slugs = $this->slugs('/api/books?search=kriptografi');
        $this->assertSame([$title->slug, $mention->slug], array_slice($slugs, 0, 2));
    }

    public function test_typo_is_corrected_and_reported(): void
    {
        $book = $this->book('Kriptografi Modern');

        $res = $this->getJson('/api/books?search=kriptograpi')->assertOk();
        $this->assertSame($book->slug, $res->json('data.0.slug'));
        $this->assertSame('kriptografi', $res->json('search.corrected'));
    }

    public function test_prefix_and_synonym_matches(): void
    {
        $book = $this->book('Kriptografi Modern');
        $this->assertContains($book->slug, $this->slugs('/api/books?search=kripto'));

        $snbt = $this->book('Taklukkan SNBT Kilat');
        $this->assertContains($snbt->slug, $this->slugs('/api/books?search=utbk'));
    }

    public function test_unrelated_query_returns_nothing_instead_of_noise(): void
    {
        // Tidak ada kata yang dikenal → kosong, bukan daftar buku acak.
        $this->assertSame([], $this->slugs('/api/books?search=xyzzy+quuxor+vbnmw'));
    }

    public function test_drafts_are_never_searchable_and_explicit_sort_wins(): void
    {
        $this->book('Kriptografi Rahasia', ['status' => 'draft']);
        $cheap = $this->book('Kriptografi Dasar', ['price' => 10000, 'synopsis' => 'x']);
        $pricey = $this->book('Kriptografi Modern Lengkap Sekali', ['price' => 90000]);

        $slugs = $this->slugs('/api/books?search=kriptografi&sort=termahal');
        $this->assertSame([$pricey->slug, $cheap->slug], $slugs);
    }

    public function test_searches_are_logged_once_and_reported_to_admin(): void
    {
        $this->book('Kriptografi Modern');
        $this->getJson('/api/books?search=kriptografi')->assertOk();
        $this->getJson('/api/books?search=kriptografi&sort=termurah')->assertOk(); // pengunjung sama, 30 menit → tidak dihitung lagi
        $this->getJson('/api/books?search=Kriptografi&page=2')->assertOk(); // halaman 2 tidak dicatat
        $this->getJson('/api/books?search=xyzzy+quuxor')->assertOk();

        $this->assertSame(1, (int) DB::table('search_query_daily')->where('query', 'kriptografi')->value('searches'));

        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());
        $report = $this->getJson('/api/admin/reports/searches?days=7')->assertOk();
        $this->assertSame(2, $report->json('total_searches'));
        $this->assertSame(50, $report->json('zero_rate'));
        $this->assertSame('xyzzy quuxor', $report->json('zero.0.query'));
        $this->assertSame(['kriptografi'], array_column(array_filter($report->json('top'), fn ($r) => $r['results'] > 0), 'query'));
    }

    public function test_search_report_is_admin_only(): void
    {
        Sanctum::actingAs($this->user());
        $this->getJson('/api/admin/reports/searches')->assertForbidden();
    }

    /* ------------------------- Pengingat membaca ------------------------- */

    private function reading(User $user, Book $book, int $page, int $daysAgo): UserLibrary
    {
        return UserLibrary::create([
            'user_id' => $user->id, 'book_id' => $book->id, 'access_status' => 'active',
            'last_read_page' => $page, 'last_read_at' => now()->subDays($daysAgo),
        ]);
    }

    public function test_saving_progress_records_last_read_time(): void
    {
        $user = $this->user();
        $book = $this->book('Kriptografi Modern');
        $lib = $this->reading($user, $book, 1, 40);

        Sanctum::actingAs($user);
        $this->postJson("/api/reader/{$book->slug}/progress", ['page' => 12])->assertOk();
        $this->assertTrue($lib->fresh()->last_read_at->isToday());
    }

    public function test_reminds_stalled_reader_once_with_closest_to_finish_book(): void
    {
        Notification::fake();
        $user = $this->user();
        $near = $this->book('Kriptografi Modern');   // 150/200 = 75%
        $early = $this->book('Statistika Terapan'); // 40/200 = 20%
        $this->reading($user, $near, 150, 9);
        $this->reading($user, $early, 40, 9);

        $this->artisan('amania:reading-reminders')->assertSuccessful();
        Notification::assertSentToTimes($user, ContinueReadingReminder::class, 1);
        Notification::assertSentTo($user, ContinueReadingReminder::class, fn ($n) => $n->bookId === $near->id && $n->page === 150);

        // Dijalankan lagi: tidak ada email ganda (buku sudah diingatkan, pengguna dalam masa jeda 14 hari).
        $this->artisan('amania:reading-reminders')->assertSuccessful();
        Notification::assertSentToTimes($user, ContinueReadingReminder::class, 1);

        $mail = (new ContinueReadingReminder($near->id, 150))->toMail($user);
        $this->assertStringContainsString('75%', $mail->subject);
        $this->assertStringContainsString("/baca/{$near->slug}", $mail->actionUrl);
    }

    public function test_skips_readers_outside_the_rules(): void
    {
        Notification::fake();
        $book = $this->book('Kriptografi Modern');
        $cases = [
            [$this->user(), 5, 9],                                  // baru 2,5% → belum benar-benar mulai
            [$this->user(), 198, 9],                                // hampir selesai (sisa < 5 halaman)
            [$this->user(), 100, 3],                                // baru berhenti 3 hari
            [$this->user(), 100, 45],                               // sudah terlalu lama
            [$this->user(['reminder_emails' => false]), 100, 9],    // mematikan pengingat
            [$this->user(['email_verified_at' => null]), 100, 9],   // email belum terverifikasi
        ];
        foreach ($cases as [$user, $page, $days]) {
            $this->reading($user, $book, $page, $days);
        }

        $this->artisan('amania:reading-reminders')->assertSuccessful();
        Notification::assertNothingSent();
    }
}
