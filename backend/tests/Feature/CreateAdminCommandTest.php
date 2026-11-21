<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/** srawung:create-admin — admin produksi tanpa data demo. */
class CreateAdminCommandTest extends TestCase
{
    use RefreshDatabase;

    public function test_creates_admin_with_strong_password_and_base_categories(): void
    {
        $this->artisan('srawung:create-admin', ['--name' => 'Pemilik', '--email' => 'Pemilik@Srawung.NET'])
            ->expectsQuestion('Kata sandi (min. 12 karakter)', 'sandi-yang-kuat-123')
            ->expectsQuestion('Ulangi kata sandi', 'sandi-yang-kuat-123')
            ->assertSuccessful();

        $admin = User::where('email', 'pemilik@srawung.net')->firstOrFail();
        $this->assertSame('admin', $admin->role);
        $this->assertNotNull($admin->email_verified_at);
        $this->assertTrue(Hash::check('sandi-yang-kuat-123', $admin->password));
        $this->assertSame(4, Category::count());
    }

    public function test_rejects_short_or_mismatched_password(): void
    {
        $this->artisan('srawung:create-admin', ['--name' => 'X', '--email' => 'x@srawung.net'])
            ->expectsQuestion('Kata sandi (min. 12 karakter)', 'pendek')
            ->assertFailed();

        $this->artisan('srawung:create-admin', ['--name' => 'X', '--email' => 'x@srawung.net'])
            ->expectsQuestion('Kata sandi (min. 12 karakter)', 'sandi-yang-kuat-123')
            ->expectsQuestion('Ulangi kata sandi', 'sandi-lain-yang-kuat')
            ->assertFailed();

        $this->assertSame(0, User::where('email', 'x@srawung.net')->count());
    }
}
