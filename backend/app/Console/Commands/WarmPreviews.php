<?php

namespace App\Console\Commands;

use App\Models\Book;
use App\Services\PreviewImages;
use Illuminate\Console\Command;

/**
 * Buat cache gambar pratinjau gratis untuk semua buku terbit (buku baru otomatis
 * dibuatkan setelah konversi selesai).
 *
 *   php artisan amania:warm-previews
 */
class WarmPreviews extends Command
{
    protected $signature = 'amania:warm-previews';

    protected $description = 'Buat cache gambar "Intip isi buku" agar pratinjau tampil cepat';

    public function handle(PreviewImages $previews): int
    {
        foreach (Book::where('status', 'published')->where('total_pages', '>', 0)->orderBy('id')->get() as $book) {
            $t = microtime(true);
            $n = $previews->warm($book);
            $this->line(sprintf('✓ %-45s %2d gambar  %.1f dtk', mb_strimwidth($book->title, 0, 44, '…'), $n, microtime(true) - $t));
        }

        return self::SUCCESS;
    }
}
