<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/** Sampul: ukuran unggahan bebas, disimpan sebagai WebP ringan berlebar maks. 1200 px. */
class CoverImageTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_large_cover_is_converted_to_compact_webp(): void
    {
        Storage::fake('public');
        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());

        $res = $this->post('/api/admin/books', [
            'title' => 'Sampul Raksasa', 'author' => 'Tes', 'synopsis' => 'x', 'price' => 50000, 'status' => 'draft',
            'cover' => UploadedFile::fake()->image('sampul.png', 2400, 3400),
        ], ['Accept' => 'application/json'])->assertCreated();

        $path = Book::find($res->json('book.id'))->cover_path;
        $this->assertStringEndsWith('.webp', $path);
        Storage::disk('public')->assertExists($path);

        [$w, $h, $type] = getimagesizefromstring(Storage::disk('public')->get($path));
        $this->assertSame(IMAGETYPE_WEBP, $type);
        $this->assertSame(1200, $w);
        $this->assertSame(1700, $h); // rasio dipertahankan
    }

    public function test_unreadable_image_is_still_stored_as_is(): void
    {
        Storage::fake('public');
        Sanctum::actingAs(User::where('role', 'admin')->firstOrFail());

        // Berekstensi .jpg tetapi isinya bukan gambar yang bisa dibaca GD → tetap tersimpan.
        $fake = UploadedFile::fake()->create('rusak.jpg', 10, 'image/jpeg');
        $res = $this->post('/api/admin/books', [
            'title' => 'Sampul Rusak', 'author' => 'Tes', 'synopsis' => 'x', 'price' => 50000, 'status' => 'draft', 'cover' => $fake,
        ], ['Accept' => 'application/json'])->assertCreated();

        $path = Book::find($res->json('book.id'))->cover_path;
        $this->assertStringEndsWith('.jpg', $path);
        Storage::disk('public')->assertExists($path);
    }
}
