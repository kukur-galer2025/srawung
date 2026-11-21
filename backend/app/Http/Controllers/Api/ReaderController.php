<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AccessLog;
use App\Models\ReaderFlag;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;
use App\Models\Book;
use App\Models\BookPage;
use App\Models\ReadingSession;
use App\Models\UserLibrary;
use App\Services\ForensicMark;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ReaderController extends Controller
{
    /** Sesi tanpa aktivitas selama ini dianggap selesai. */
    public const IDLE_MINUTES = 180;

    /**
     * Batas kecepatan ambil halaman per akun: [batas, jendela detik, label].
     * Pembaca manusia rata-rata < 6 halaman/menit; batas ini longgar untuk pembaca
     * cepat, tapi menghentikan skrip yang mengunduh seluruh buku.
     */
    public const RATE_LIMITS = [
        'menit' => [30, 60],
        'jam' => [360, 3600],
        'hari' => [1500, 86400],
    ];

    public function startSession(Request $request, $bookSlug)
    {
        $user = $request->user();
        $book = Book::where('slug', $bookSlug)->firstOrFail();

        $library = UserLibrary::where('user_id', $user->id)
            ->where('book_id', $book->id)
            ->where('access_status', 'active')
            ->first();

        if (!$library) {
            return response()->json(['message' => 'Anda tidak memiliki akses ke buku ini.'], 403);
        }

        // Tanpa batas perangkat: akun boleh membaca di banyak perangkat sekaligus.
        // Sesi yang lama tak aktif cukup ditutup agar daftar sesi tetap rapi.
        ReadingSession::where('user_id', $user->id)
            ->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('last_seen_at')->orWhere('last_seen_at', '<', now()->subMinutes(self::IDLE_MINUTES)))
            ->update(['is_active' => false, 'ended_reason' => 'idle']);

        $sessionToken = Str::random(64);

        $session = ReadingSession::create([
            'user_id' => $user->id,
            'book_id' => $book->id,
            'session_token' => $sessionToken,
            'started_at' => Carbon::now(),
            'last_seen_at' => Carbon::now(),
            'ip_address' => $request->ip() ?: '127.0.0.1',
            'device' => $request->header('User-Agent'),
            'is_active' => true,
        ]);

        AccessLog::create([
            'user_id' => $user->id,
            'book_id' => $book->id,
            'page_number' => $library->last_read_page ?: 1,
            'ip_address' => $request->ip() ?: '127.0.0.1',
            'created_at' => now(),
        ]);

        return response()->json([
            'session_token' => $sessionToken,
            'book' => [
                'id' => $book->id,
                'title' => $book->title,
                'slug' => $book->slug,
                'author' => $book->author,
                'total_pages' => $book->total_pages,
            ],
            'last_read_page' => $library->last_read_page ?: 1,
        ]);
    }

    public function getPage(Request $request, $bookSlug, $pageNumber)
    {
        $token = $request->bearerToken() ?: $request->query('token');
        if (!$token) {
            return response()->json(['message' => 'Sesi baca tidak valid.'], 401);
        }

        $session = ReadingSession::with(['user', 'book'])
            ->where('session_token', $token)
            ->first();

        if (!$session) {
            return response()->json(['message' => 'Sesi baca tidak valid.', 'code' => 'session_invalid'], 401);
        }

        if ($session->is_active && $session->last_seen_at && $session->last_seen_at->lt(now()->subMinutes(self::IDLE_MINUTES))) {
            $session->update(['is_active' => false, 'ended_reason' => 'idle']);
        }

        if (!$session->is_active) {
            return response()->json(['message' => 'Sesi baca telah berakhir. Muat ulang halaman untuk melanjutkan.', 'code' => 'session_ended'], 401);
        }

        $book = $session->book;
        if ($book->slug !== $bookSlug) {
            return response()->json(['message' => 'Buku tidak sesuai dengan sesi.'], 400);
        }

        $user = $session->user;

        // Cek kembali status perpustakaan
        $hasAccess = UserLibrary::where('user_id', $user->id)
            ->where('book_id', $book->id)
            ->where('access_status', 'active')
            ->exists();

        if (!$hasAccess) {
            return response()->json(['message' => 'Akses buku telah dicabut.'], 403);
        }

        if ($limited = $this->throttlePageFetch($user->id, $book->id, $request)) {
            return $limited;
        }

        if (!$session->last_seen_at || $session->last_seen_at->lt(now()->subSeconds(30))) {
            $session->forceFill(['last_seen_at' => now()])->saveQuietly();
        }

        $image = $this->loadPageImage($book, (int) $pageNumber);

        // Tambahkan Watermark menggunakan GD
        $width = imagesx($image);
        $height = imagesy($image);

        // Warna watermark abu-abu transparan/kontras rendah
        $watermarkColor = imagecolorallocatealpha($image, 180, 180, 180, 60);
        $watermarkText = "{$user->name} | {$user->email} | Srawung";

        // Gambar watermark miring/diagonal atau di beberapa titik
        imagestring($image, 5, 40, $height - 50, $watermarkText, $watermarkColor);
        imagestring($image, 5, 40, 30, "Akses Resmi: {$user->email}", $watermarkColor);
        imagestring($image, 5, max(40, (int)($width / 4)), (int)($height / 2), "Dilisensikan kepada: {$user->name}", $watermarkColor);

        // Watermark forensik nyaris tak terlihat (kode akun) — tetap ada walau watermark di atas dipotong.
        ForensicMark::apply($image, $user);

        // Simpan log akses
        AccessLog::create([
            'user_id' => $user->id,
            'book_id' => $book->id,
            'page_number' => (int) $pageNumber,
            'ip_address' => $request->ip() ?: '127.0.0.1',
            'created_at' => now(),
        ]);

        [$binary, $contentType] = $this->encodeImage($image);

        return response($binary, 200, [
            'Content-Type' => $contentType,
            'Cache-Control' => 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma' => 'no-cache',
        ]);
    }

    /**
     * Batasi kecepatan ambil halaman per akun. Pelanggaran dicatat sebagai
     * aktivitas mencurigakan (sekali per jendela waktu) untuk ditinjau admin.
     */
    private function throttlePageFetch(int $userId, int $bookId, Request $request): ?\Illuminate\Http\JsonResponse
    {
        foreach (self::RATE_LIMITS as $label => [$max, $window]) {
            $key = "reader:{$label}:{$userId}";
            if (RateLimiter::tooManyAttempts($key, $max)) {
                $retry = RateLimiter::availableIn($key);
                if (Cache::add("reader-flag:{$label}:{$userId}", 1, $window)) {
                    ReaderFlag::create([
                        'user_id' => $userId,
                        'book_id' => $bookId,
                        'reason' => "rate_{$label}",
                        'details' => ['limit' => $max, 'window_seconds' => $window, 'ip' => $request->ip(), 'agent' => mb_substr((string) $request->userAgent(), 0, 180)],
                    ]);
                }

                return response()->json([
                    'message' => $label === 'menit'
                        ? 'Halaman dibuka terlalu cepat. Tunggu sebentar lalu lanjutkan membaca.'
                        : "Batas wajar membaca per {$label} telah tercapai. Silakan lanjutkan beberapa saat lagi.",
                    'code' => 'rate_limited',
                    'retry_after' => $retry,
                ], 429)->header('Retry-After', (string) $retry);
            }
        }

        foreach (self::RATE_LIMITS as $label => [$max, $window]) {
            RateLimiter::hit("reader:{$label}:{$userId}", $window);
        }

        return null;
    }

    /**
     * Pratinjau publik (tanpa login) — hanya untuk halaman 1..preview_pages,
     * diperkecil dan diberi watermark "PRATINJAU".
     */
    public function previewPage(Request $request, $bookSlug, $pageNumber)
    {
        $book = Book::where('slug', $bookSlug)->where('status', 'published')->firstOrFail();
        $pageNumber = (int) $pageNumber;

        if ($pageNumber < 1 || $pageNumber > \App\Services\PreviewImages::limit($book)) {
            return response()->json(['message' => 'Halaman ini tidak termasuk pratinjau gratis.'], 403);
        }

        // ?w=240 → thumbnail untuk deretan "Intip isi buku"; bawaan 900 px untuk modal.
        $img = app(\App\Services\PreviewImages::class)->get($book, $pageNumber, (int) $request->query('w', 900));
        $headers = [
            'Content-Type' => $img['type'],
            'Cache-Control' => 'public, max-age=86400, stale-while-revalidate=604800',
            'ETag' => $img['etag'],
        ];
        if ($request->header('If-None-Match') === $img['etag']) {
            return response('', 304, $headers);
        }

        return response($img['binary'], 200, $headers);
    }

    /** @return \GdImage */
    private function loadPageImage(Book $book, int $pageNumber)
    {
        $page = BookPage::where('book_id', $book->id)->where('page_number', $pageNumber)->first();
        $pagePath = $page ? Storage::disk('local')->path($page->image_path) : null;

        $image = null;
        if ($pagePath && file_exists($pagePath)) {
            $info = @getimagesize($pagePath);
            $mime = $info['mime'] ?? 'image/jpeg';
            if ($mime === 'image/webp' && function_exists('imagecreatefromwebp')) {
                $image = @imagecreatefromwebp($pagePath);
            } elseif ($mime === 'image/png' && function_exists('imagecreatefrompng')) {
                $image = @imagecreatefrompng($pagePath);
            } elseif (function_exists('imagecreatefromjpeg')) {
                $image = @imagecreatefromjpeg($pagePath);
            }
        }

        // Jika gambar tidak ditemukan atau gagal dimuat, buat halaman dinamis
        if (!$image) {
            $image = imagecreatetruecolor(800, 1130);
            $bg = imagecolorallocate($image, 255, 255, 255);
            $fg = imagecolorallocate($image, 30, 41, 59);
            $gray = imagecolorallocate($image, 148, 163, 184);
            imagefill($image, 0, 0, $bg);
            imagerectangle($image, 20, 20, 780, 1110, $gray);
            imagestring($image, 5, 40, 50, $book->title, $fg);
            imagestring($image, 4, 40, 80, 'Penulis: ' . $book->author, $fg);
            imagestring($image, 4, 40, 140, "Halaman {$pageNumber} dari {$book->total_pages}", $fg);
            imagestring($image, 3, 40, 200, 'Konten resmi dilindungi hak cipta Srawung.', $gray);
            imagestring($image, 3, 380, 1080, "- {$pageNumber} -", $fg);
        }

        return $image;
    }

    /** @return array{0: string, 1: string} */
    private function encodeImage($image, int $quality = 85): array
    {
        ob_start();
        if (function_exists('imagewebp')) {
            imagewebp($image, null, $quality);
            $contentType = 'image/webp';
        } else {
            imagejpeg($image, null, $quality);
            $contentType = 'image/jpeg';
        }
        $binary = ob_get_clean();
        imagedestroy($image);

        return [$binary, $contentType];
    }

    public function saveProgress(Request $request, $bookSlug)
    {
        $request->validate([
            'page' => 'required|integer|min:1',
        ]);

        $user = $request->user();
        $book = Book::where('slug', $bookSlug)->firstOrFail();

        $library = UserLibrary::where('user_id', $user->id)
            ->where('book_id', $book->id)
            ->firstOrFail();

        $library->update([
            'last_read_page' => min((int) $request->page, $book->total_pages ?: 1000),
            'last_read_at' => now(), // dipakai pengingat "lanjutkan membaca"
        ]);

        return response()->json([
            'message' => 'Progress baca berhasil disimpan.',
            'last_read_page' => $library->last_read_page,
        ]);
    }
}
