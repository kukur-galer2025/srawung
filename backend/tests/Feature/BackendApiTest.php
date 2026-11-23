<?php

namespace Tests\Feature;

use App\Models\Book;
use App\Models\Category;
use App\Models\User;
use App\Models\UserLibrary;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class BackendApiTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;
    public function test_categories_api_returns_seeded_data(): void
    {
        $response = $this->getJson('/api/categories');
        $response->assertStatus(200)
                 ->assertJsonCount(5);
    }

    public function test_books_api_returns_paginated_books(): void
    {
        $response = $this->getJson('/api/books');
        $response->assertStatus(200)
                 ->assertJsonStructure([
                     'data',
                     'current_page',
                     'total',
                 ]);
    }

    public function test_single_book_api_returns_details_and_preview_pages(): void
    {
        $book = Book::first();
        $this->assertNotNull($book);

        $response = $this->getJson('/api/books/' . $book->slug);
        $response->assertStatus(200)
                 ->assertJsonFragment(['slug' => $book->slug])
                 ->assertJsonStructure(['preview_pages']);
    }

    public function test_buyer_login_and_auth_me_flow(): void
    {
        $loginRes = $this->postJson('/api/auth/login', [
            'email' => 'buyer@amania.com',
            'password' => 'password123',
        ]);

        $loginRes->assertStatus(200)
                 ->assertJsonStructure(['token', 'user']);

        $token = $loginRes->json('token');

        $meRes = $this->withToken($token)->getJson('/api/auth/me');
        $meRes->assertStatus(200)
              ->assertJsonFragment(['email' => 'buyer@amania.com']);
    }

    public function test_reader_flow_and_watermark_page(): void
    {
        $buyer = User::where('email', 'buyer@amania.com')->first();
        $book = Book::first();

        UserLibrary::updateOrCreate(
            ['user_id' => $buyer->id, 'book_id' => $book->id],
            ['access_status' => 'active', 'last_read_page' => 1]
        );

        $token = $buyer->createToken('test_token')->plainTextToken;

        // Start reading session
        $sessionRes = $this->withToken($token)->postJson('/api/reader/' . $book->slug . '/session');
        $sessionRes->assertStatus(200)
                   ->assertJsonStructure(['session_token']);

        $sessionToken = $sessionRes->json('session_token');

        // Token di alamat ditolak (tercatat di log & riwayat); hanya header Authorization yang berlaku.
        $this->flushHeaders();
        $this->get('/api/reader/' . $book->slug . '/pages/1?token=' . $sessionToken)->assertUnauthorized();
        $pageRes = $this->withToken($sessionToken)->get('/api/reader/' . $book->slug . '/pages/1');
        $pageRes->assertStatus(200);
        $this->assertTrue(in_array($pageRes->headers->get('Content-Type'), ['image/webp', 'image/jpeg']));
        $this->assertGreaterThan(1000, strlen($pageRes->getContent()));
    }

    public function test_admin_access_control(): void
    {
        $buyer = User::where('email', 'buyer@amania.com')->first();
        \Laravel\Sanctum\Sanctum::actingAs($buyer);

        // Buyer should be forbidden
        $forbiddenRes = $this->getJson('/api/admin/dashboard');
        $forbiddenRes->assertStatus(403);

        $admin = User::where('role', 'admin')->first();
        \Laravel\Sanctum\Sanctum::actingAs($admin);

        // Admin should be allowed
        $adminRes = $this->getJson('/api/admin/dashboard');
        $adminRes->assertStatus(200)
                 ->assertJsonStructure(['total_books_count', 'chart_data']);
    }

    public function test_google_auth_routes(): void
    {
        // Test redirect route redirects to accounts.google.com
        $redirectRes = $this->get('/api/auth/google/redirect?challenge=' . hash('sha256', 'uji'));
        $redirectRes->assertStatus(302);
        $this->assertStringContainsString('accounts.google.com', $redirectRes->headers->get('Location'));

        // Test google login validation requires credential
        $loginRes = $this->postJson('/api/auth/google', []);
        $loginRes->assertStatus(422)
                 ->assertJsonValidationErrors(['credential']);
    }
}
