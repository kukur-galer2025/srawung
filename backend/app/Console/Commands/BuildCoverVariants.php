<?php

namespace App\Console\Commands;

use App\Models\Book;
use Illuminate\Console\Command;

/**
 * Buat varian WebP kecil (160/320/640 px) + placeholder buram untuk sampul yang belum
 * punya. Sampul baru otomatis dibuatkan saat diunggah; perintah ini untuk sampul lama.
 *
 *   php artisan amania:cover-variants          # hanya yang belum punya varian
 *   php artisan amania:cover-variants --force  # buat ulang semuanya
 */
class BuildCoverVariants extends Command
{
    protected $signature = 'amania:cover-variants {--force : Buat ulang meski varian sudah ada}';

    protected $description = 'Buat varian sampul kecil & placeholder buram agar sampul tampil instan';

    public function handle(): int
    {
        $query = Book::whereNotNull('cover_path')->where('cover_path', 'not like', 'http%');
        if (!$this->option('force')) {
            $query->whereNull('cover_meta');
        }

        $done = 0;
        $failed = 0;
        foreach ($query->cursor() as $book) {
            $book->syncCoverMeta(true);
            if ($book->cover_meta) {
                $book->saveQuietly();
                $done++;
                $this->line("✓ {$book->title} (" . implode('/', $book->cover_meta['w']) . ' px, placeholder ' . strlen((string) $book->cover_meta['ph']) . ' byte)');
            } else {
                $failed++;
                $this->warn("Lewati {$book->title}: file sampul tidak bisa diolah.");
            }
        }

        $this->info("Selesai: {$done} sampul diproses" . ($failed ? ", {$failed} dilewati" : '') . '.');

        return self::SUCCESS;
    }
}
