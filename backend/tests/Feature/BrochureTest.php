<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Category;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/** Brosur PDF: admin memilih buku → PDF berisi sampul, halaman isi, dan QR. */
class BrochureTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::forceCreate(['name' => 'Admin', 'email' => 'admin-brosur@srawung.test', 'password' => 'x', 'role' => 'admin', 'is_blocked' => false, 'email_verified_at' => now()]);
    }

    private function book(string $title, string $status = 'published'): Book
    {
        $cat = Category::firstOrCreate(['slug' => 'pemrograman'], ['name' => 'Pemrograman']);
        $cover = UploadedFile::fake()->image('cover.jpg', 400, 566)->store('covers', 'public');

        return Book::create([
            'title' => $title, 'slug' => str($title)->slug(), 'author' => 'Penulis Uji',
            'synopsis' => '<p>Belajar <b>dari nol</b> sampai mahir dengan contoh nyata.</p>',
            'price' => 99000, 'sale_price' => 79000, 'category_id' => $cat->id,
            'cover_path' => $cover, 'total_pages' => 320, 'status' => $status,
        ]);
    }

    public function test_admin_generates_pdf_in_both_layouts(): void
    {
        $books = collect(['Buku Satu', 'Buku Dua', 'Buku Tiga'])->map(fn ($t) => $this->book($t));
        $admin = $this->admin();

        foreach (['katalog', 'sorotan'] as $layout) {
            $res = $this->actingAs($admin)->post('/api/admin/brochure', [
                'book_ids' => $books->pluck('id')->reverse()->values()->all(),
                'layout' => $layout,
                'title' => 'Promo Akhir Tahun',
                'promo_code' => 'brosur10',
                'show_prices' => true,
                'include_cover' => true,
            ]);

            $res->assertOk()->assertHeader('Content-Type', 'application/pdf');
            $this->assertStringStartsWith('%PDF', $res->getContent());
            $this->assertGreaterThan(20_000, strlen($res->getContent()), "{$layout}: sampul, font & QR tertanam");
        }
    }

    public function test_validation_and_access(): void
    {
        $draft = $this->book('Masih Draf', 'draft');
        $admin = $this->admin();

        $this->actingAs($admin)->postJson('/api/admin/brochure', ['book_ids' => [], 'layout' => 'katalog'])
            ->assertStatus(422)->assertJsonValidationErrors('book_ids');
        $this->actingAs($admin)->postJson('/api/admin/brochure', ['book_ids' => [$draft->id], 'layout' => 'katalog'])
            ->assertStatus(422)->assertJsonValidationErrors('book_ids.0');
        $this->actingAs($admin)->postJson('/api/admin/brochure', ['book_ids' => [$this->book('Terbit')->id], 'layout' => 'aneh'])
            ->assertStatus(422)->assertJsonValidationErrors('layout');

        $buyer = User::forceCreate(['name' => 'B', 'email' => 'b-brosur@srawung.test', 'password' => 'x', 'role' => 'buyer', 'is_blocked' => false]);
        $this->actingAs($buyer)->postJson('/api/admin/brochure', ['book_ids' => [1], 'layout' => 'katalog'])->assertForbidden();
    }
}
