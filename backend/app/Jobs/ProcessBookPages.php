<?php

namespace App\Jobs;

use App\Models\Book;
use App\Models\BookPage;
use App\Services\BookTextIndexer;
use App\Services\PdfPageConverter;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Throwable;
use App\Models\User;
use App\Notifications\BookProcessingFinished;
use App\Services\OrderLifecycle;

/**
 * Mengubah PDF sumber sebuah buku menjadi gambar per halaman.
 *
 * Bila konversi gagal (alat tidak terpasang, PDF rusak/terkunci), buku ditandai
 * "failed" beserta alasannya dan halaman lama TIDAK disentuh — job ini tidak
 * pernah membuat halaman kosong/placeholder.
 */
class ProcessBookPages implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 1;
    public int $timeout = 1800;

    public function __construct(public int $bookId) {}

    public function handle(PdfPageConverter $converter): void
    {
        $book = Book::find($this->bookId);
        if (!$book || !$book->source_file_path) {
            return;
        }

        $disk = Storage::disk('local');
        $sourcePath = $disk->path($book->source_file_path);
        if (!is_file($sourcePath)) {
            $this->markFailed($book, 'File PDF sumber tidak ditemukan di server. Silakan unggah ulang.');
            return;
        }

        $book->update([
            'processing_status' => 'processing',
            'processing_error' => null,
            'processing_pages_done' => 0,
            'processing_pages_total' => $converter->pageCount($sourcePath),
            'processing_started_at' => now(),
            'processing_finished_at' => null,
        ]);

        // Simpan progres paling sering tiap ±1,5 detik agar tidak membebani database.
        $lastWrite = 0.0;
        $onProgress = function (int $done) use ($book, &$lastWrite) {
            $now = microtime(true);
            $total = $book->processing_pages_total;
            if ($now - $lastWrite < 1.5 && !($total && $done >= $total)) {
                return;
            }
            $lastWrite = $now;
            $book->forceFill(['processing_pages_done' => $total ? min($done, $total) : $done])->saveQuietly();
        };

        $pagesDir = "books/{$book->id}/pages";
        $tmpDir = "books/{$book->id}/pages_tmp_" . Str::lower(Str::random(8));

        try {
            $files = $converter->convert($sourcePath, $disk->path($tmpDir), $onProgress);
        } catch (Throwable $e) {
            $disk->deleteDirectory($tmpDir);
            $this->markFailed($book, $e->getMessage());
            return;
        }

        // Tukar halaman lama dengan yang baru hanya setelah konversi sukses penuh.
        DB::transaction(function () use ($book, $disk, $pagesDir, $tmpDir, $files) {
            BookPage::where('book_id', $book->id)->delete();
            $disk->deleteDirectory($pagesDir);
            File::moveDirectory($disk->path($tmpDir), $disk->path($pagesDir), true);

            $now = now();
            $rows = [];
            foreach ($files as $i => $file) {
                $rows[] = [
                    'book_id' => $book->id,
                    'page_number' => $i + 1,
                    'image_path' => $pagesDir . '/' . basename($file),
                    'created_at' => $now,
                    'updated_at' => $now,
                ];
            }
            foreach (array_chunk($rows, 200) as $chunk) {
                BookPage::insert($chunk);
            }

            $book->update([
                'total_pages' => count($files),
                'processing_status' => 'done',
                'processing_error' => null,
                'processing_pages_done' => count($files),
                'processing_pages_total' => count($files),
                'processing_finished_at' => now(),
            ]);
        });

        // Pratinjau gratis dibuat di muka → "Intip isi buku" langsung tampil cepat.
        try {
            app(\App\Services\PreviewImages::class)->warm($book->fresh());
        } catch (Throwable $e) {
            Log::warning("Cache pratinjau buku #{$book->id} gagal dibuat: {$e->getMessage()}");
        }

        // Teks halaman (pencarian) + daftar isi. Gagal di sini tidak membatalkan konversi.
        try {
            app(BookTextIndexer::class)->index($book->fresh());
        } catch (Throwable $e) {
            Log::warning("Indeks teks buku #{$book->id} gagal: {$e->getMessage()}");
        }

        self::notifyOwner($book->fresh());
    }

    /** Kabari pemilik buku (kreator, atau admin untuk buku Srawung) bahwa konversi selesai/gagal. */
    public static function notifyOwner(Book $book): void
    {
        $notification = new BookProcessingFinished($book);
        try {
            if ($book->creator_id && ($creator = User::find($book->creator_id))) {
                $creator->notify($notification);
            } else {
                OrderLifecycle::notifyAdmin($notification);
            }
        } catch (Throwable $e) {
            Log::error("Gagal mengirim email status konversi buku #{$book->id}: {$e->getMessage()}");
        }
    }

    public function failed(?Throwable $e): void
    {
        if ($book = Book::find($this->bookId)) {
            $this->markFailed($book, 'Proses konversi terhenti: ' . ($e?->getMessage() ?: 'kesalahan tidak diketahui'));
        }
    }

    private function markFailed(Book $book, string $reason): void
    {
        Log::error("Konversi PDF buku #{$book->id} gagal: {$reason}");
        $book->update([
            'processing_status' => 'failed',
            'processing_error' => mb_substr($reason, 0, 1000),
            'processing_finished_at' => now(),
        ]);
        self::notifyOwner($book->fresh());
    }
}
