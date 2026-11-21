<?php

namespace App\Console\Commands;

use App\Jobs\ProcessBookPages;
use App\Models\Book;
use App\Models\BookPage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * Membuat ulang gambar halaman dari PDF sumber — mis. saat pindah server
 * (cukup salin PDF sumber, gambar halaman dibuat ulang di server baru).
 *
 *   php artisan amania:rebuild-pages            # hanya buku yang gambarnya hilang
 *   php artisan amania:rebuild-pages --all      # semua buku
 *   php artisan amania:rebuild-pages --book=14
 */
class RebuildPages extends Command
{
    protected $signature = 'amania:rebuild-pages {--book= : ID buku tertentu} {--all : Proses ulang semua buku, walau gambarnya lengkap}';

    protected $description = 'Buat ulang gambar halaman buku dari PDF sumber (mis. saat pindah server)';

    public function handle(): int
    {
        $disk = Storage::disk('local');
        $force = $this->option('all') || $this->option('book');

        $books = Book::whereNotNull('source_file_path')
            ->when($this->option('book'), fn ($q, $id) => $q->whereKey($id))
            ->orderBy('id')
            ->get()
            ->filter(function (Book $book) use ($disk, $force) {
                if ($force) {
                    return true;
                }
                $pages = BookPage::where('book_id', $book->id)->pluck('image_path');

                return $pages->isEmpty() || $pages->contains(fn ($p) => !$disk->exists($p));
            });

        if ($books->isEmpty()) {
            $this->info('✓ Semua gambar halaman lengkap.');

            return self::SUCCESS;
        }

        $failed = 0;
        foreach ($books as $book) {
            $this->line("• {$book->title} …");
            ProcessBookPages::dispatchSync($book->id);
            $book->refresh();
            if ($book->processing_status === 'done') {
                $this->info("  ✓ {$book->total_pages} halaman");
            } else {
                $failed++;
                $this->error('  ✗ ' . ($book->processing_error ?: 'gagal'));
            }
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
