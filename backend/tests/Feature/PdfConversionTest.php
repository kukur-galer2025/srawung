<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookPage;
use App\Models\User;
use App\Notifications\BookProcessingFinished;
use App\Services\PdfPageConverter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Unggah PDF → halaman buku. Tidak boleh ada halaman kosong/placeholder palsu.
 */
class PdfConversionTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private Book $book;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());

        $this->book = Book::create([
            'title' => 'Buku Uji Konversi',
            'slug' => 'buku-uji-konversi',
            'author' => 'Penguji',
            'synopsis' => 'Sinopsis.',
            'price' => 50000,
            'status' => 'draft',
        ]);
    }

    /** PDF sah minimal dengan N halaman kosong berukuran A5. */
    private function makePdf(int $pages): string
    {
        $objects = [1 => '<< /Type /Catalog /Pages 2 0 R >>'];
        $kids = [];
        for ($i = 0; $i < $pages; $i++) {
            $id = 3 + $i;
            $kids[] = "{$id} 0 R";
            $objects[$id] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] >>';
        }
        $objects[2] = '<< /Type /Pages /Kids [' . implode(' ', $kids) . "] /Count {$pages} >>";
        ksort($objects);

        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $id => $body) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "{$id} 0 obj\n{$body}\nendobj\n";
        }
        $xref = strlen($pdf);
        $count = count($objects) + 1;
        $pdf .= "xref\n0 {$count}\n0000000000 65535 f \n";
        foreach ($offsets as $offset) {
            $pdf .= sprintf("%010d 00000 n \n", $offset);
        }

        return $pdf . "trailer\n<< /Size {$count} /Root 1 0 R >>\nstartxref\n{$xref}\n%%EOF\n";
    }

    private function upload(string $content)
    {
        return $this->post("/api/admin/books/{$this->book->id}/upload", [
            'file' => UploadedFile::fake()->createWithContent('buku.pdf', $content),
        ], ['Accept' => 'application/json']);
    }

    private function requireConverter(): void
    {
        if (!app(PdfPageConverter::class)->detect()) {
            $this->markTestSkipped('Poppler/Ghostscript tidak terpasang di mesin ini.');
        }
    }

    public function test_uploaded_pdf_becomes_one_real_image_per_page(): void
    {
        $this->requireConverter();

        $this->upload($this->makePdf(3))->assertOk();

        $book = $this->book->fresh();
        $this->assertSame('done', $book->processing_status, (string) $book->processing_error);
        $this->assertSame(3, $book->total_pages);

        $pages = BookPage::where('book_id', $book->id)->orderBy('page_number')->get();
        $this->assertSame([1, 2, 3], $pages->pluck('page_number')->all());

        foreach ($pages as $page) {
            Storage::disk('local')->assertExists($page->image_path);
            [$width, , $type] = getimagesize(Storage::disk('local')->path($page->image_path));
            $this->assertSame(IMAGETYPE_JPEG, $type);
            $this->assertSame(1300, $width);
        }

        // Tidak ada sisa folder sementara.
        $this->assertSame(
            ["books/{$book->id}/pages"],
            Storage::disk('local')->directories("books/{$book->id}"),
        );
    }

    public function test_progress_is_tracked_and_owner_is_emailed(): void
    {
        $this->requireConverter();
        Notification::fake();

        // Buku kreator -> email ke kreator pemiliknya.
        $creator = User::forceCreate([
            'name' => 'Rina Kreator', 'email' => 'rina@kreator.test', 'password' => 'password123',
            'role' => 'creator', 'is_blocked' => false, 'email_verified_at' => now(),
        ]);
        $this->book->forceFill(['creator_id' => $creator->id])->save();

        $this->upload($this->makePdf(4))->assertOk();

        $book = $this->book->fresh();
        $this->assertSame('done', $book->processing_status, (string) $book->processing_error);
        $this->assertSame([4, 4], [$book->processing_pages_done, $book->processing_pages_total]);
        $this->assertNotNull($book->processing_started_at);
        $this->assertNotNull($book->processing_finished_at);
        Notification::assertSentTo($creator, BookProcessingFinished::class, fn ($n) => $n->book->processing_status === 'done');

        // Progres terlihat di daftar buku.
        $this->getJson('/api/admin/books')->assertOk()->assertJsonPath('data.0.processing_pages_total', 4);
    }

    public function test_failed_conversion_emails_admin_with_reason(): void
    {
        Notification::fake();
        $this->app->bind(PdfPageConverter::class, fn () => new class extends PdfPageConverter {
            public function detect(): ?array
            {
                return null;
            }
        });

        $this->upload($this->makePdf(2))->assertOk();

        $this->assertNotNull($this->book->fresh()->processing_finished_at);
        Notification::assertSentOnDemand(BookProcessingFinished::class, function ($n, $channels, $notifiable) {
            $mail = $n->toMail($notifiable);

            return $n->book->processing_status === 'failed' && str_contains($mail->subject, 'gagal');
        });
    }

    public function test_reuploading_replaces_old_pages(): void
    {
        $this->requireConverter();

        $this->upload($this->makePdf(4))->assertOk();
        $this->upload($this->makePdf(2))->assertOk();

        $this->assertSame(2, $this->book->fresh()->total_pages);
        $this->assertSame(2, BookPage::where('book_id', $this->book->id)->count());
        $this->assertCount(2, Storage::disk('local')->files("books/{$this->book->id}/pages"));
    }

    public function test_missing_converter_fails_loudly_without_fake_pages(): void
    {
        $this->app->bind(PdfPageConverter::class, fn () => new class extends PdfPageConverter {
            public function detect(): ?array
            {
                return null;
            }
        });

        $this->upload($this->makePdf(3))->assertOk();

        $book = $this->book->fresh();
        $this->assertSame('failed', $book->processing_status);
        $this->assertStringContainsString('Alat konversi PDF tidak ditemukan', $book->processing_error);
        $this->assertSame(0, BookPage::where('book_id', $book->id)->count(), 'Tidak boleh membuat halaman palsu.');
        $this->assertSame(0, $book->total_pages);
    }

    public function test_broken_pdf_fails_and_keeps_previous_pages(): void
    {
        $this->requireConverter();

        $this->upload($this->makePdf(2))->assertOk();
        $this->upload("%PDF-1.4\nini bukan pdf yang benar\n%%EOF\n")->assertOk();

        $book = $this->book->fresh();
        $this->assertSame('failed', $book->processing_status);
        $this->assertNotEmpty($book->processing_error);
        // Halaman dari unggahan sukses sebelumnya tetap utuh untuk pembaca.
        $this->assertSame(2, BookPage::where('book_id', $book->id)->count());
        $this->assertCount(2, Storage::disk('local')->files("books/{$book->id}/pages"));
    }

    public function test_failed_book_can_be_reprocessed(): void
    {
        $this->requireConverter();

        $this->upload($this->makePdf(2))->assertOk();
        $this->book->update(['processing_status' => 'failed', 'processing_error' => 'simulasi']);

        $this->postJson("/api/admin/books/{$this->book->id}/reprocess")->assertOk();

        $this->assertSame('done', $this->book->fresh()->processing_status);
        $this->assertNull($this->book->fresh()->processing_error);
    }

    public function test_system_status_reports_converter_and_failed_books(): void
    {
        $this->book->update(['processing_status' => 'failed']);

        $this->getJson('/api/admin/system-status')
            ->assertOk()
            ->assertJsonStructure(['pdf_converter' => ['ok', 'engine'], 'queue' => ['ok', 'pending', 'failed'], 'scheduler' => ['ok', 'last_run'], 'books_failed'])
            ->assertJsonPath('books_failed', 1);
    }
}
