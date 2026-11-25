<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Category;
use App\Models\Book;
use App\Models\BookPage;
use App\Models\Coupon;
use App\Models\Setting;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // Admin
        User::firstOrNew(['email' => 'primadzakyhibatulloh@gmail.com'])->forceFill([
            'name' => 'Admin Srawung',
            'whatsapp' => '6281234567890',
            'password' => Hash::make('password123'),
            'role' => 'admin',
            'email_verified_at' => now(),
        ])->save();

        // Regular buyer for testing
        User::firstOrNew(['email' => 'buyer@amania.com'])->forceFill([
            'name' => 'Budi Pembeli',
            'whatsapp' => '6289876543210',
            'password' => Hash::make('password123'),
            'role' => 'buyer',
            'email_verified_at' => now(),
        ])->save();

        // Kreator demo (domain .test: email penjualan tidak terkirim ke alamat sungguhan)
        $creator = User::firstOrNew(['email' => 'kreator@amania.test']);
        $creator->forceFill([
            'name' => 'Kreator Demo',
            'whatsapp' => '6281200001111',
            'password' => Hash::make('password123'),
            'role' => 'creator',
            'email_verified_at' => now(),
        ])->save();
        $creator->creatorProfile()->firstOrCreate([], [
            'display_name' => 'Kreator Demo',
            'bio' => 'Akun kreator untuk mencoba fitur unggah buku, voucher, dan penarikan saldo.',
        ]);

        // Categories
        $cats = ['Novel', 'Non-Fiksi', 'Self-Help', 'Teknologi', 'Agama'];
        $catModels = [];
        foreach ($cats as $cat) {
            $catModels[] = Category::updateOrCreate(
                ['slug' => Str::slug($cat)],
                ['name' => $cat]
            );
        }

        // Coupons
        Coupon::updateOrCreate(['code' => 'DISKON10'], ['type' => 'percent', 'value' => 10, 'quota' => 100]);
        Coupon::updateOrCreate(['code' => 'HEMAT20000'], ['type' => 'fixed', 'value' => 20000, 'quota' => 50]);

        // Settings (hanya diisi bila belum ada, supaya pengaturan admin tidak tertimpa)
        $settings = [
            'bank_name' => 'BCA',
            'bank_account' => '1234567890',
            'bank_holder' => 'Amania Digital Books',
            'whatsapp_admin' => '6285181836438',
            'payment_message_template' => 'Halo {nama}, pesanan #{nomor} senilai Rp {total} telah {status}. Terima kasih!',
            'payment_deadline_hours' => '24',
        ];
        foreach ($settings as $key => $value) {
            Setting::firstOrCreate(['key' => $key], ['value' => $value]);
        }

        // Buku: test otomatis memakai buku demo kecil (cepat), aplikasi memakai katalog asli Amania Press.
        if (app()->environment('testing')) {
            $this->seedDemoBooks($catModels);
        } else {
            $this->call(AmaniaPressBookSeeder::class);
            $this->call(StorefrontSeeder::class);
        }
    }

    /**
     * Buku demo berhalaman placeholder — khusus untuk test otomatis.
     *
     * @param  array<int, Category>  $catModels
     */
    private function seedDemoBooks(array $catModels): void
    {
        $books = [
            ['Kisah di Balik Layar', 'Rina Kartika', 'Novel tentang perjuangan seorang kreator konten.', 65000, 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=600&auto=format&fit=crop&q=80'],
            ['Rahasia Produktivitas', 'Budi Santoso', 'Panduan hidup produktif ala orang sukses.', 75000, 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=600&auto=format&fit=crop&q=80'],
            ['Meraih Mimpi Digital', 'Sari Dewi', 'Kisah inspiratif pengusaha muda Indonesia.', 59000, 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=600&auto=format&fit=crop&q=80'],
            ['Teknologi Masa Depan', 'Ahmad Fauzi', 'Tren teknologi yang akan mengubah dunia.', 89000, 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80'],
            ['Hati yang Damai', 'Ustaz Hamid', 'Refleksi ketenangan jiwa dalam Islam.', 55000, 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=600&auto=format&fit=crop&q=80'],
            ['Coding untuk Semua', 'Dian Pramono', 'Belajar programming dari nol.', 95000, 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&auto=format&fit=crop&q=80'],
            ['Cinta Tanpa Syarat', 'Lena Susanti', 'Novel romansa keluarga modern.', 60000, 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=600&auto=format&fit=crop&q=80'],
            ['Menjadi Pemimpin Sejati', 'Prof. Hendra', 'Kepemimpinan di era disrupsi.', 85000, 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&auto=format&fit=crop&q=80'],
            ['Resep Sukses UMKM', 'Maya Rahayu', 'Strategi bisnis untuk pengusaha kecil.', 70000, 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&auto=format&fit=crop&q=80'],
            ['Dunia Tanpa Batas', 'Fajar Nugroho', 'Kisah petualangan keliling Indonesia.', 65000, 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=600&auto=format&fit=crop&q=80'],
            ['Mindset Juara', 'Coach Reza', 'Pola pikir pemenang dalam kehidupan.', 80000, 'https://images.unsplash.com/photo-1529699211952-734e80c4d42b?w=600&auto=format&fit=crop&q=80'],
            ['Quran dan Sains', 'Dr. Yusuf', 'Harmoni antara wahyu dan ilmu pengetahuan.', 92000, 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&auto=format&fit=crop&q=80'],
        ];

        foreach ($books as $i => $b) {
            $book = Book::updateOrCreate(
                ['slug' => Str::slug($b[0])],
                [
                    'title' => $b[0],
                    'author' => $b[1],
                    'synopsis' => $b[2],
                    'price' => $b[3],
                    'cover_path' => $b[4] ?? null,
                    'category_id' => $catModels[$i % count($catModels)]->id,
                    'total_pages' => 15,
                    'preview_pages' => 5,
                    'status' => 'published',
                ]
            );

            // Create placeholder pages for book so reader works immediately
            $outputDir = "books/{$book->id}/pages";
            Storage::disk('local')->makeDirectory($outputDir);
            for ($p = 1; $p <= 15; $p++) {
                $pagePath = "{$outputDir}/page_{$p}.jpg";
                if (!Storage::disk('local')->exists($pagePath)) {
                    $img = imagecreatetruecolor(794, 1123);
                    $bg = imagecolorallocate($img, 248, 250, 252);
                    $fg = imagecolorallocate($img, 30, 41, 59);
                    $border = imagecolorallocate($img, 226, 232, 240);
                    imagefill($img, 0, 0, $bg);
                    imagerectangle($img, 20, 20, 773, 1102, $border);
                    imagestring($img, 5, 50, 60, "{$book->title} - Oleh {$book->author}", $fg);
                    imagestring($img, 4, 50, 100, "Bab " . ceil($p / 3) . " - Halaman {$p}", $fg);
                    imagestring($img, 3, 50, 180, "Ini adalah konten preview buku digital '{$book->title}'.", $fg);
                    imagestring($img, 3, 50, 210, "Srawung menjamin perlindungan hak cipta dan kenyamanan membaca.", $fg);
                    imagestring($img, 3, 380, 1050, "- {$p} -", $fg);
                    ob_start();
                    imagejpeg($img, null, 85);
                    $imageData = ob_get_clean();
                    imagedestroy($img);
                    Storage::disk('local')->put($pagePath, $imageData);
                }

                BookPage::firstOrCreate([
                    'book_id' => $book->id,
                    'page_number' => $p,
                ], [
                    'image_path' => $pagePath,
                ]);
            }
        }
    }
}
