<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Setting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** srawung:rebrand-data — mengganti sebutan Amania di konten, tanpa menyentuh data resmi & penerbit. */
class RebrandDataTest extends TestCase
{
    use RefreshDatabase;

    protected $seed = true;

    public function test_rebrands_content_but_keeps_imprint_payment_data_and_slugs(): void
    {
        $admin = User::forceCreate(['name' => 'Admin Amania', 'email' => 'admin-lama@amania.com', 'password' => 'x', 'role' => 'admin', 'is_blocked' => false]);
        $cat = Category::create(['name' => 'Pilihan Amania', 'slug' => 'pilihan-amania']);
        Setting::set('payment_message_template', 'Halo {nama}, buku terbitan Amania Press, terima kasih telah berbelanja di Amania.');
        Setting::set('bank_holder', 'Amania Digital Books');
        Setting::set('qris_merchant_name', 'AMANIA - SOFTWARE');

        // Pratinjau: tidak ada yang berubah.
        $this->artisan('srawung:rebrand-data')->assertSuccessful();
        $this->assertSame('Admin Amania', $admin->fresh()->name);

        $this->artisan('srawung:rebrand-data', ['--apply' => true])->assertSuccessful();

        $this->assertSame('Admin Srawung', $admin->fresh()->name);
        $this->assertSame('admin-lama@amania.com', $admin->fresh()->email, 'email tidak disentuh');
        $cat->refresh();
        $this->assertSame('Pilihan Srawung', $cat->name);
        $this->assertSame('pilihan-amania', $cat->slug, 'slug/URL tidak disentuh');
        $this->assertSame('Halo {nama}, buku terbitan Amania Press, terima kasih telah berbelanja di Srawung.', Setting::get('payment_message_template'), '"Amania Press" tetap');
        $this->assertSame('Amania Digital Books', Setting::get('bank_holder'), 'nama pemilik rekening resmi tidak diubah');
        $this->assertSame('AMANIA - SOFTWARE', Setting::get('qris_merchant_name'), 'nama merchant QRIS tidak diubah');
    }
}
