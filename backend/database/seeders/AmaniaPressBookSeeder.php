<?php

namespace Database\Seeders;

use App\Jobs\ProcessBookPages;
use App\Models\Book;
use App\Models\BookPage;
use App\Models\Category;
use Illuminate\Database\Seeder;
use Illuminate\Http\File;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Katalog buku asli Amania Press dari folder database/seeders/books/amania-press:
 *   - <nama>.pdf          → isi buku, dikonversi menjadi halaman (Poppler)
 *   - covers/Cover-*.png  → sampul
 *
 * Aman dijalankan berulang: buku di-update berdasarkan slug, dan PDF yang
 * tidak berubah (hash sama & halaman sudah lengkap) tidak dikonversi ulang.
 *
 *   php artisan db:seed --class=AmaniaPressBookSeeder
 */
class AmaniaPressBookSeeder extends Seeder
{
    /** Relatif terhadap folder database/. */
    public const SOURCE_DIR = 'seeders/books/amania-press';

    private const AUTHOR = 'Tim Redaksi Amania Press';

    /** Harga awal — silakan ubah lewat Admin → Buku. */
    private const BOOKS = [
        [
            'pdf' => 'PHP-Pemula-sampai-Mahir-Amania-Press.pdf',
            'cover' => 'Cover-PHP-Pemula-sampai-Mahir.png',
            'title' => 'PHP dari Pemula sampai Mahir',
            'category' => 'Pemrograman',
            'price' => 89000,
            'synopsis' => "Belajar membangun aplikasi web modern dengan PHP 8: dari baris kode pertama, database, OOP, sampai REST API dan arsitektur MVC.\n\nPanduan lengkap dan interaktif dari Seri Pemrograman Web Amania Press: 26 bab dengan 130 kuis untuk menguji pemahaman Anda di setiap langkah.",
        ],
        [
            'pdf' => 'Laravel-dari-Nol-sampai-Deploy-Amania-Press.pdf',
            'cover' => 'Cover-Laravel-dari-Nol-sampai-Deploy.png',
            'title' => 'Laravel dari Nol sampai Deploy',
            'category' => 'Pemrograman',
            'price' => 99000,
            'synopsis' => "Membangun aplikasi web modern dengan PHP: routing, Blade, Eloquent, autentikasi, API, pengujian, hingga online di server sendiri.\n\nPanduan lengkap berbasis Laravel 13 dari Seri Pemrograman Web Amania Press: 22 bab dengan 110 kuis.",
        ],
        [
            'pdf' => 'Pemrograman-Go-Pemula-sampai-Mahir-Amania-Press.pdf',
            'cover' => 'Cover-Pemrograman-Go-Pemula-sampai-Mahir.png',
            'title' => 'Pemrograman Go dari Pemula sampai Mahir',
            'category' => 'Pemrograman',
            'price' => 89000,
            'synopsis' => "Belajar Go modern selangkah demi selangkah: sintaks, struct dan interface, error handling, generics, goroutine dan channel, hingga REST API yang siap produksi.\n\nSeri Pemrograman Backend Amania Press untuk Go 1.24+: 22 bab dengan 110 kuis.",
        ],
        [
            'pdf' => 'Pemrograman-CPP-Pemula-sampai-Mahir-Amania-Press.pdf',
            'cover' => 'Cover-Pemrograman-CPP-Pemula-sampai-Mahir.png',
            'title' => 'Pemrograman C++ dari Pemula sampai Mahir',
            'category' => 'Pemrograman',
            'price' => 89000,
            'synopsis' => "Belajar C++ modern langkah demi langkah: dasar sintaks, pointer dan memori, OOP, template, STL, smart pointer, hingga konkurensi dan proyek utuh.\n\nSeri Pemrograman Sistem Amania Press untuk C++20 dan C++23: 22 bab dengan 110 kuis.",
        ],
        [
            'pdf' => 'Python-untuk-Analisis-Data-Amania-Press.pdf',
            'cover' => 'Cover-Python-untuk-Analisis-Data.png',
            'title' => 'Python untuk Analisis Data',
            'category' => 'Pemrograman',
            'price' => 95000,
            'synopsis' => "Mengolah, membersihkan, memvisualisasikan, dan menarik kesimpulan dari data nyata dengan NumPy, pandas, Matplotlib, seaborn, dan statistik.\n\nPanduan praktis Seri Pemrograman Data Amania Press berbasis pandas 3: 22 bab dengan 110 kuis.",
        ],
        [
            'pdf' => 'Jago-Prompting-Amania-Press.pdf',
            'cover' => 'Cover-Jago-Prompting.png',
            'title' => 'Jago Prompting: Cara Cerdas Bekerja Bersama AI',
            'category' => 'Teknologi & AI',
            'price' => 69000,
            'synopsis' => "Teknik menulis perintah yang membuat ChatGPT, Claude, Gemini, dan asisten AI lain bekerja tepat sasaran untuk kuliah, kantor, dan bisnis.\n\nPanduan praktis Seri Teknologi AI Amania Press: 20 bab, 100 kuis, dan lebih dari 200 contoh prompt siap pakai.",
        ],
        [
            'pdf' => 'Desain-Itu-Gampang-Amania-Press.pdf',
            'cover' => 'Cover-Desain-Itu-Gampang.png',
            'title' => 'Desain Itu Gampang: Jago UI/UX dengan Figma dari Nol sampai Portofolio',
            'category' => 'Desain',
            'price' => 79000,
            'synopsis' => "Belajar prinsip desain, riset pengguna, dan Figma langkah demi langkah, lalu merancang aplikasi utuh yang siap dipamerkan di portofolio.\n\nSeri Desain UI/UX Amania Press: 18 bab dan 90 kuis, lengkap dengan studi kasus aplikasi.",
        ],
        [
            'pdf' => 'Panduan-Lengkap-Lolos-SKD-CPNS-Amania-Press.pdf',
            'cover' => 'Cover-Panduan-Lengkap-Lolos-SKD-CPNS.png',
            'title' => 'Panduan Lengkap Lolos SKD CPNS',
            'category' => 'Persiapan Ujian',
            'price' => 79000,
            'synopsis' => "Strategi, materi, dan ratusan latihan soal TWK, TIU, dan TKP lengkap dengan pembahasan, untuk menembus nilai ambang batas dan bersaing di peringkat atas.\n\nSeri Karier ASN Amania Press: 22 bab dan 202 soal beserta pembahasan, disusun mengikuti format CAT (110 soal, 100 menit).",
        ],
        [
            'pdf' => 'Sukses-SNBT-2027-Amania-Press.pdf',
            'cover' => 'Cover-Sukses-SNBT-2027.png',
            'title' => 'Sukses SNBT 2027',
            'category' => 'Persiapan Ujian',
            'price' => 79000,
            'synopsis' => "Materi, trik kilat, ratusan soal berpembahasan, dan tryout lengkap 7 subtes UTBK, sesuai kisi-kisi terbaru SNPMB.\n\nPanduan lengkap Seri Persiapan Ujian PTN Amania Press: 17 bab, 289 soal interaktif, dan tryout 160 soal.",
        ],
    ];

    public function run(): void
    {
        $dir = database_path(self::SOURCE_DIR);
        if (!is_dir($dir)) {
            $this->command?->warn("Folder \"{$dir}\" tidak ditemukan — seeder buku Amania Press dilewati.");
            return;
        }

        $local = Storage::disk('local');
        $public = Storage::disk('public');

        foreach (self::BOOKS as $data) {
            $pdfPath = $dir . DIRECTORY_SEPARATOR . $data['pdf'];
            if (!is_file($pdfPath)) {
                $this->command?->warn("Lewati \"{$data['title']}\": file {$data['pdf']} tidak ada.");
                continue;
            }

            $category = Category::firstOrCreate(['slug' => Str::slug($data['category'])], ['name' => $data['category']]);
            // Slug dari judul utama (bagian sebelum titik dua), mis. "jago-prompting".
            $slug = Str::slug(Str::before($data['title'], ':'));

            $book = Book::updateOrCreate(['slug' => $slug], [
                'title' => $data['title'],
                'author' => self::AUTHOR,
                'synopsis' => $data['synopsis'],
                'price' => $data['price'],
                'category_id' => $category->id,
                'preview_pages' => 8,
                'status' => 'published',
            ]);

            // Sampul → disk public (diakses lewat /storage/covers/...)
            $coverPath = $dir . DIRECTORY_SEPARATOR . 'covers' . DIRECTORY_SEPARATOR . $data['cover'];
            if (is_file($coverPath)) {
                $target = "covers/amania-press/{$slug}.png";
                $public->putFileAs('covers/amania-press', new File($coverPath), "{$slug}.png");
                $book->update(['cover_path' => $target]);
            } else {
                $this->command?->warn("  Sampul {$data['cover']} tidak ditemukan untuk \"{$data['title']}\".");
            }

            // PDF → halaman. Lewati bila PDF sama persis dan halaman sudah lengkap.
            $sourceRel = "books/{$book->id}/source.pdf";
            $unchanged = $book->processing_status === 'done'
                && $local->exists($sourceRel)
                && hash_file('sha256', $local->path($sourceRel)) === hash_file('sha256', $pdfPath)
                && BookPage::where('book_id', $book->id)->count() === (int) $book->total_pages
                && $book->total_pages > 0;

            if ($unchanged) {
                $this->command?->line("  ✓ {$data['title']} — sudah terkini ({$book->total_pages} halaman)");
                continue;
            }

            $local->putFileAs("books/{$book->id}", new File($pdfPath), 'source.pdf');
            $book->update(['source_file_path' => $sourceRel, 'processing_status' => 'pending', 'processing_error' => null]);

            $started = microtime(true);
            ProcessBookPages::dispatchSync($book->id);
            $book->refresh();

            if ($book->processing_status === 'done') {
                $this->command?->info(sprintf('  ✓ %s — %d halaman (%.1f dtk)', $data['title'], $book->total_pages, microtime(true) - $started));
            } else {
                $this->command?->error("  ✗ {$data['title']} — konversi gagal: {$book->processing_error}");
            }
        }

        // Sembunyikan buku demo (konten palsu dengan sampul Unsplash). Tidak dihapus — bisa diterbitkan lagi dari admin.
        $archived = Book::where('cover_path', 'like', 'https://images.unsplash.com/%')
            ->where('status', 'published')
            ->update(['status' => 'draft']);
        if ($archived) {
            $this->command?->line("  {$archived} buku demo lama diubah menjadi draf (tidak tampil di toko).");
        }
    }
}
