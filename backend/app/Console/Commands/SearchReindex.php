<?php

namespace App\Console\Commands;

use App\Models\Book;
use App\Services\BookSearch;
use Illuminate\Console\Command;

/**
 * Bangun ulang indeks "Cari di dalam semua buku" dari teks halaman yang sudah tersimpan.
 * (Buku baru terindeks otomatis setelah PDF-nya diproses.)
 *
 *   php artisan amania:search-reindex
 *   php artisan amania:search-reindex --book=14
 */
class SearchReindex extends Command
{
    protected $signature = 'amania:search-reindex {--book= : ID buku tertentu}';

    protected $description = 'Bangun ulang indeks pencarian isi buku (BM25)';

    public function handle(BookSearch $search): int
    {
        $books = Book::whereHas('pages', fn ($q) => $q->whereNotNull('text'))
            ->when($this->option('book'), fn ($q, $id) => $q->whereKey($id))
            ->orderBy('id')
            ->get();

        if ($books->isEmpty()) {
            $this->warn('Belum ada buku dengan teks halaman. Jalankan dulu: php artisan amania:index-books');

            return self::SUCCESS;
        }

        foreach ($books as $book) {
            $started = microtime(true);
            $postings = $search->indexBook($book);
            $this->info(sprintf('  ✓ %s — %s entri indeks (%.1f dtk)', $book->title, number_format($postings, 0, ',', '.'), microtime(true) - $started));
        }

        return self::SUCCESS;
    }
}
