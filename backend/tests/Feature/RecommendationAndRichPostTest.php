<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Category;
use App\Models\Post;
use App\Models\User;
use App\Models\UserLibrary;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RecommendationAndRichPostTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    private function buyer(): User
    {
        return User::forceCreate([
            'name' => 'Pembaca Uji',
            'email' => fake()->unique()->safeEmail(),
            'password' => 'password123',
            'role' => 'buyer',
            'is_blocked' => false,
            'email_verified_at' => now(),
        ]);
    }

    private function admin(): User
    {
        return User::where('role', 'admin')->firstOrFail();
    }

    /* ---------------- Rekomendasi ---------------- */

    public function test_similar_books_exclude_itself_and_prefer_same_topic(): void
    {
        $cat = Category::create(['name' => 'Kuliner', 'slug' => 'kuliner']);
        $a = Book::create(['title' => 'Resep Rendang Padang', 'slug' => 'rendang', 'author' => 'X', 'synopsis' => 'Masakan rendang padang daging bumbu rempah', 'price' => 50000, 'category_id' => $cat->id, 'status' => 'published']);
        $b = Book::create(['title' => 'Rahasia Bumbu Rendang', 'slug' => 'bumbu-rendang', 'author' => 'Y', 'synopsis' => 'Bumbu rempah rendang dan masakan padang', 'price' => 50000, 'category_id' => $cat->id, 'status' => 'published']);

        $ids = collect($this->getJson('/api/books/rendang/similar')->assertOk()->json('data'))->pluck('id');

        $this->assertFalse($ids->contains($a->id));
        $this->assertSame($b->id, $ids->first());
    }

    public function test_personal_recommendations_skip_owned_books_and_follow_preferences(): void
    {
        $user = $this->buyer();
        $owned = Book::where('status', 'published')->firstOrFail();
        UserLibrary::create(['user_id' => $user->id, 'book_id' => $owned->id, 'access_status' => 'active']);

        $favorite = Category::where('id', '!=', $owned->category_id)->firstOrFail();
        $user->update(['preferred_categories' => [$favorite->id]]);
        Sanctum::actingAs($user);

        $res = $this->getJson('/api/recommendations?limit=6')->assertOk()->assertJson(['personalized' => true]);
        $data = collect($res->json('data'));

        $this->assertFalse($data->pluck('id')->contains($owned->id), 'Buku yang sudah dimiliki tidak boleh direkomendasikan.');
        $this->assertTrue($data->contains(fn ($b) => str_contains($b['reason'], $favorite->name)), 'Topik favorit harus muncul dengan alasannya.');
        $this->assertArrayNotHasKey('source_file_path', $data->first());
    }

    public function test_guest_recommendations_use_browser_history(): void
    {
        $seen = Book::where('status', 'published')->firstOrFail();

        $res = $this->getJson("/api/recommendations?seen={$seen->id}")->assertOk()->assertJson(['personalized' => true]);
        $this->assertNotSame($seen->id, $res->json('data.0.id'), 'Buku yang baru dilihat tidak diulang di urutan teratas.');

        $this->getJson('/api/recommendations')->assertOk()->assertJson(['personalized' => false]);
    }

    public function test_book_views_are_deduplicated(): void
    {
        $book = Book::where('status', 'published')->firstOrFail();

        $this->postJson("/api/books/{$book->slug}/view")->assertOk();
        $this->postJson("/api/books/{$book->slug}/view")->assertOk();

        $this->assertSame(1, DB::table('book_views')->where('book_id', $book->id)->count());
    }

    public function test_preferences_can_be_saved_and_validated(): void
    {
        Sanctum::actingAs($this->buyer());
        $ids = Category::limit(2)->pluck('id')->all();

        $this->putJson('/api/profile/preferences', ['category_ids' => $ids])->assertOk()->assertJson(['category_ids' => $ids]);
        $this->getJson('/api/profile/preferences')->assertJson(['category_ids' => $ids]);
        $this->putJson('/api/profile/preferences', ['category_ids' => [999999]])->assertStatus(422);
    }

    /* ---------------- Artikel editor visual ---------------- */

    public function test_rich_html_posts_are_sanitized(): void
    {
        Sanctum::actingAs($this->admin());

        $dirty = '<h2>Judul</h2><p onclick="steal()">Halo <strong>dunia</strong></p>'
            . '<script>alert(1)</script><img src="https://cdn.example/a.png" onerror="x()" alt="foto">'
            . '<a href="javascript:alert(1)">jahat</a><a href="https://amania.id" target="_blank">baik</a><iframe src="https://evil"></iframe>';

        $res = $this->postJson('/api/admin/posts', ['title' => 'Artikel Kaya', 'body' => $dirty, 'format' => 'html', 'status' => 'published'])->assertCreated();
        $stored = Post::findOrFail($res->json('post.id'))->body;

        foreach (['<script', 'onclick', 'onerror', 'javascript:', '<iframe'] as $bad) {
            $this->assertStringNotContainsString($bad, $stored);
        }
        $this->assertStringContainsString('<h2>Judul</h2>', $stored);
        $this->assertStringContainsString('src="https://cdn.example/a.png"', $stored);
        $this->assertStringContainsString('rel="noreferrer noopener"', $stored);

        $html = $this->getJson('/api/posts/artikel-kaya')->assertOk()->json('body_html');
        $this->assertStringContainsString('loading="lazy"', $html);
        $this->assertSame(1, substr_count($html, 'loading="lazy"'));
    }

    public function test_admin_can_upload_article_images(): void
    {
        Storage::fake('public');
        Sanctum::actingAs($this->admin());

        $url = $this->post('/api/admin/posts/images', ['image' => UploadedFile::fake()->image('foto.jpg', 2400, 1200)], ['Accept' => 'application/json'])
            ->assertCreated()
            ->json('url');

        $this->assertStringContainsString('/storage/posts/content/', $url);
        $path = 'posts/content/' . str($url)->after('/posts/content/');
        Storage::disk('public')->assertExists($path);
        if (function_exists('imagewebp')) {
            $this->assertStringEndsWith('.webp', $path);
            [$w] = getimagesizefromstring(Storage::disk('public')->get($path));
            $this->assertSame(1600, $w, 'Gambar lebar diperkecil ke 1600px.');
        }

        Sanctum::actingAs($this->buyer());
        $this->post('/api/admin/posts/images', ['image' => UploadedFile::fake()->image('x.jpg')], ['Accept' => 'application/json'])->assertForbidden();
    }
}
