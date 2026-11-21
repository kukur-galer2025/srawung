<?php

namespace App\Console\Commands;

use App\Models\Book;
use App\Services\BookTextIndexer;
use Illuminate\Console\Command;
use Throwable;

/**
 * Mengisi ulang teks halaman (pencarian) dan daftar isi untuk buku yang sudah dikonversi.
 *
 *   php artisan amania:index-books            # semua buku yang PDF-nya sudah diproses
 *   php artisan amania:index-books --book=14  # satu buku
 */
class IndexBooks extends Command
{
    protected $signature = 'amania:index-books {--book= : ID buku tertentu}';

    protected $description = 'Ambil teks halaman & susun daftar isi dari PDF buku';

    public function handle(BookTextIndexer $indexer): int
    {
        $books = Book::query()
            ->where('processing_status', 'done')
            ->whereNotNull('source_file_path')
            ->when($this->option('book'), fn ($q, $id) => $q->whereKey($id))
            ->orderBy('id')
            ->get();

        if ($books->isEmpty()) {
            $this->warn('Tidak ada buku yang bisa diindeks.');

            return self::SUCCESS;
        }

        $failed = 0;
        foreach ($books as $book) {
            try {
                $started = microtime(true);
                $r = $indexer->index($book);
                $this->info(sprintf('  ✓ %s — %d halaman, %d entri daftar isi (%.1f dtk)', $book->title, $r['pages'], $r['toc'], microtime(true) - $started));
            } catch (Throwable $e) {
                $failed++;
                $this->error("  ✗ {$book->title} — {$e->getMessage()}");
            }
        }

        return $failed ? self::FAILURE : self::SUCCESS;
    }
}
