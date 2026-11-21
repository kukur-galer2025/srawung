<?php

namespace App\Console\Commands;

use App\Models\Book;
use App\Services\CoverImage;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Konversi sampul lama (PNG/JPG besar) menjadi WebP ringan — sampul baru sudah
 * otomatis dikonversi saat diunggah.
 *
 *   php artisan amania:optimize-covers                     # sampul yang belum WebP
 *   php artisan amania:optimize-covers --delete-original   # sekaligus hapus file asli
 */
class OptimizeCovers extends Command
{
    protected $signature = 'amania:optimize-covers {--delete-original : Hapus file sampul asli setelah dikonversi}';

    protected $description = 'Konversi sampul buku lama menjadi WebP terkompresi agar katalog cepat tampil';

    public function handle(): int
    {
        $disk = Storage::disk('public');
        $before = 0;
        $after = 0;
        $done = 0;

        $books = Book::whereNotNull('cover_path')
            ->where('cover_path', 'not like', '%.webp')
            ->where('cover_path', 'not like', 'http%') // sampul eksternal (URL) tidak disentuh
            ->get();
        if ($books->isEmpty()) {
            $this->info('Semua sampul sudah WebP.');

            return self::SUCCESS;
        }

        foreach ($books as $book) {
            $old = $book->cover_path;
            if (!$disk->exists($old)) {
                $this->warn("Lewati #{$book->id} {$book->title}: file {$old} tidak ditemukan.");
                continue;
            }

            $webp = CoverImage::toWebp($disk->path($old));
            if ($webp === null) {
                $this->warn("Lewati #{$book->id} {$book->title}: gambar tidak bisa diolah.");
                continue;
            }

            $new = 'covers/cover_' . now()->format('YmdHis') . '_' . Str::random(8) . '.webp';
            $disk->put($new, $webp);
            $book->forceFill(['cover_path' => $new]);
            $book->syncCoverMeta(true); // varian kecil + placeholder untuk sampul baru
            $book->saveQuietly();

            $size = $disk->size($old);
            $before += $size;
            $after += strlen($webp);
            $done++;
            $this->line(sprintf('✓ %-45s %6s KB → %5s KB', Str::limit($book->title, 42), number_format($size / 1024), number_format(strlen($webp) / 1024)));

            if ($this->option('delete-original') && !Book::where('cover_path', $old)->exists()) {
                $disk->delete($old);
            }
        }

        if ($done) {
            $this->info(sprintf('%d sampul dikonversi: %s KB → %s KB (hemat %d%%).', $done, number_format($before / 1024), number_format($after / 1024), round(100 - $after / max(1, $before) * 100)));
        }

        return self::SUCCESS;
    }
}
