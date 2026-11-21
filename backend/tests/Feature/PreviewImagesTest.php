<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\BookPage;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** "Intip isi buku": gambar pratinjau di-cache sebagai file statis + thumbnail kecil. */
class PreviewImagesTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_previews_are_cached_as_static_files_with_thumbnails(): void
    {
        $book = Book::create(['title' => 'Uji Pratinjau', 'slug' => 'uji-pratinjau', 'author' => 'A', 'synopsis' => 'x', 'price' => 1000,
            'status' => 'published', 'total_pages' => 10, 'preview_pages' => 3]);
        foreach ([1, 2] as $p) { // halaman 3 sengaja belum punya file
            $img = imagecreatetruecolor(1200, 1700);
            imagefill($img, 0, 0, imagecolorallocate($img, 250, 250, 250));
            ob_start();
            imagejpeg($img);
            Storage::disk('local')->put("books/{$book->id}/pages/page_{$p}.jpg", (string) ob_get_clean());
            BookPage::create(['book_id' => $book->id, 'page_number' => $p, 'image_path' => "books/{$book->id}/pages/page_{$p}.jpg"]);
        }

        $images = $this->getJson("/api/books/{$book->slug}")->assertOk()->json('preview_images');
        $this->assertSame([1, 2], array_column($images, 'page'), 'halaman tanpa file (pengganti) tidak di-cache');
        $thumb = str_replace(Storage::disk('public')->url(''), '', $images[0]['thumb']);
        Storage::disk('public')->assertExists($thumb);
        $this->assertSame(240, getimagesizefromstring(Storage::disk('public')->get($thumb))[0]);

        // Endpoint API tetap berfungsi: ETag → 304, thumbnail lewat ?w=240, di luar batas → 403.
        $res = $this->get("/api/books/{$book->slug}/preview/1")->assertOk();
        $this->get("/api/books/{$book->slug}/preview/1", ['If-None-Match' => $res->headers->get('ETag')])->assertStatus(304);
        $this->assertSame(240, getimagesizefromstring($this->get("/api/books/{$book->slug}/preview/2?w=240")->getContent())[0]);
        $this->get("/api/books/{$book->slug}/preview/4")->assertForbidden();

        // Konversi ulang (versi berubah) → cache lama dibersihkan saat dipanaskan.
        $book->forceFill(['processing_finished_at' => now()->addMinute()])->save();
        app(\App\Services\PreviewImages::class)->warm($book->fresh());
        Storage::disk('public')->assertMissing($thumb);
    }
}
