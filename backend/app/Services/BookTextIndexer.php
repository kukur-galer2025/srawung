<?php

namespace App\Services;

use App\Models\Book;
use App\Models\BookPage;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Mengambil teks setiap halaman PDF (untuk pencarian di dalam buku) dan menyusun
 * daftar isi otomatis.
 *
 * Daftar isi diambil dengan dua cara, yang pertama lebih akurat:
 *  1. Mengurai halaman "Daftar Isi" milik buku itu sendiri
 *     (baris "Judul ........ 23", bab bernomor, sub-bab menjorok, judul BAGIAN).
 *  2. Cadangan: judul bab dari kepala halaman, mis. "BAB 4 · ROUTING".
 */
class BookTextIndexer
{
    public function __construct(private readonly PdfPageConverter $converter) {}

    public function pdftotextPath(): ?string
    {
        $configured = config('services.pdftotext.path');
        if ($configured && is_file($configured)) {
            return $configured;
        }

        $tool = $this->converter->detect();
        if ($tool && $tool['engine'] === 'poppler') {
            $dir = dirname($tool['path']);
            foreach (['pdftotext.exe', 'pdftotext'] as $name) {
                if (is_file($dir . DIRECTORY_SEPARATOR . $name)) {
                    return $dir . DIRECTORY_SEPARATOR . $name;
                }
            }
        }

        $which = Process::run(PHP_OS_FAMILY === 'Windows' ? ['where', 'pdftotext'] : ['which', 'pdftotext']);

        return $which->successful() ? (trim(strtok($which->output(), "\r\n")) ?: null) : null;
    }

    /**
     * Teks per halaman (indeks 0 = halaman 1).
     *
     * @return list<string>
     */
    public function extractPages(string $pdfPath): array
    {
        $bin = $this->pdftotextPath();
        if (!$bin) {
            throw new RuntimeException('pdftotext (Poppler) tidak ditemukan — pencarian & daftar isi tidak dapat dibuat.');
        }

        $out = tempnam(sys_get_temp_dir(), 'amania-txt');
        try {
            $result = Process::timeout(600)->run([$bin, '-enc', 'UTF-8', '-layout', $pdfPath, $out]);
            if ($result->failed() || !is_file($out)) {
                throw new RuntimeException('Teks PDF gagal diambil: ' . Str::limit(trim($result->errorOutput()), 300));
            }
            $pages = explode("\f", (string) file_get_contents($out));
        } finally {
            @unlink($out);
        }

        // pdftotext menutup dokumen dengan \f → elemen terakhir kosong.
        if (count($pages) > 1 && trim((string) end($pages)) === '') {
            array_pop($pages);
        }

        return array_map(fn ($p) => $this->clean($p), $pages);
    }

    /** Ambil teks + daftar isi lalu simpan ke database. */
    public function index(Book $book): array
    {
        $path = Storage::disk('local')->path((string) $book->source_file_path);
        if (!$book->source_file_path || !is_file($path)) {
            throw new RuntimeException('File PDF sumber tidak ditemukan.');
        }

        $pages = $this->extractPages($path);
        $total = (int) ($book->total_pages ?: count($pages));

        DB::transaction(function () use ($book, $pages) {
            foreach ($pages as $i => $text) {
                BookPage::where('book_id', $book->id)->where('page_number', $i + 1)->update(['text' => $this->forSearch($text)]);
            }
        });

        $toc = $this->buildToc($pages, $total);
        $book->forceFill(['toc' => $toc ?: null])->saveQuietly();

        // Indeks "Cari di dalam semua buku".
        app(BookSearch::class)->indexBook($book);

        return ['pages' => count($pages), 'toc' => count($toc)];
    }

    /**
     * @param  list<string>  $pages
     * @return list<array{title: string, page: int|null, level: int, number?: string}>
     */
    public function buildToc(array $pages, int $totalPages): array
    {
        $toc = $this->parsePrintedToc($pages, $totalPages);

        return count($toc) >= 4 ? $toc : $this->tocFromRunningHeaders($pages);
    }

    /* ------------------------------------------------------------------ */

    private function parsePrintedToc(array $pages, int $totalPages): array
    {
        $entries = [];
        $tocStarted = false;

        foreach (array_slice($pages, 0, 60, true) as $text) {
            $compact = Str::upper(preg_replace('/\s+/', '', $text));
            // Halaman daftar isi = menyebut "Daftar Isi" DAN berisi banyak baris "judul ... nomor".
            // (Kalimat biasa seperti "lihat Daftar Isi" tidak ikut terhitung.)
            $entryLines = preg_match_all('/\S\s{2,}\d{1,4}\s*$/m', $text);
            $isTocPage = (str_contains($compact, 'DAFTARISI') || str_contains($compact, 'TABLEOFCONTENTS')) && $entryLines >= 3;
            if (!$isTocPage) {
                if ($tocStarted) {
                    break; // halaman daftar isi sudah selesai
                }
                continue;
            }
            $tocStarted = true;

            foreach (preg_split('/\R/', $text) as $line) {
                $raw = rtrim($line);
                $trim = trim($raw);
                if ($trim === '' || $this->isRunningHeader($trim)) {
                    continue;
                }

                // Bab/sub-bab: "[nomor]  Judul   ....   23" (nomor bab opsional)
                if (preg_match('/^(\s*)(?:(\d{1,3})\s{2,})?(\S.*?)\s{2,}(?:\.{2,}\s*)?(\d{1,4})$/u', $raw, $m)) {
                    $title = trim(preg_replace('/\.{2,}$/', '', $m[3]));
                    if ($title === '' || mb_strlen($title) > 120) {
                        continue;
                    }
                    $indent = strlen($m[1]);
                    $level = $m[2] !== '' ? 1 : ($indent >= 3 ? 2 : 1);
                    $entry = ['title' => $title, 'page' => (int) $m[4], 'level' => $level];
                    if ($m[2] !== '') {
                        $entry['number'] = $m[2];
                    }
                    $entries[] = $entry;

                    continue;
                }

                // Judul bagian tanpa nomor halaman: "BAGIAN II · DASAR WEB", "LAMPIRAN & PENUTUP"
                if (mb_strlen($trim) <= 60 && $trim === mb_strtoupper($trim) && preg_match('/\p{L}{3,}/u', $trim)
                    && !preg_match('/^(ISI BUKU|DAFTAR ISI)$/u', $trim)) {
                    $entries[] = ['title' => Str::title(Str::lower($trim)), 'page' => null, 'level' => 0];
                }
            }
        }

        $entries = array_values(array_filter($entries, fn ($e) => $e['page'] === null || ($e['page'] >= 1 && $e['page'] <= max(1, $totalPages + 50))));
        if (count(array_filter($entries, fn ($e) => $e['page'] !== null)) < 4) {
            return [];
        }

        $offset = $this->detectOffset($entries, $pages);
        foreach ($entries as $i => $e) {
            if ($e['page'] !== null) {
                $entries[$i]['page'] = max(1, min($totalPages ?: PHP_INT_MAX, $e['page'] + $offset));
            }
        }

        // Judul bagian menunjuk ke halaman entri berikutnya.
        for ($i = count($entries) - 1; $i >= 0; $i--) {
            if ($entries[$i]['page'] === null) {
                $entries[$i]['page'] = $entries[$i + 1]['page'] ?? null;
            }
        }

        return array_values(array_filter($entries, fn ($e) => $e['page'] !== null));
    }

    /** Nomor halaman cetak bisa berbeda dari halaman PDF; cari geseran yang paling cocok. */
    private function detectOffset(array $entries, array $pages): int
    {
        $samples = array_slice(array_values(array_filter($entries, fn ($e) => $e['page'] !== null && $e['level'] <= 1)), 0, 12);
        // Judul di halaman pembuka bab sering terpotong ke beberapa baris → samakan spasi dulu.
        $pages = array_map(fn ($p) => preg_replace('/\s+/u', ' ', $p) ?? $p, $pages);
        $best = 0;
        $bestScore = -1;
        for ($off = -10; $off <= 30; $off++) {
            $score = 0;
            foreach ($samples as $e) {
                $idx = $e['page'] + $off - 1;
                $needle = Str::lower(Str::limit($e['title'], 24, ''));
                if ($idx >= 0 && isset($pages[$idx]) && str_contains(Str::lower($pages[$idx]), $needle)) {
                    $score++;
                }
            }
            if ($score > $bestScore || ($score === $bestScore && abs($off) < abs($best))) {
                $best = $off;
                $bestScore = $score;
            }
        }

        return $best;
    }

    private function tocFromRunningHeaders(array $pages): array
    {
        $seen = [];
        $toc = [];
        foreach ($pages as $i => $text) {
            foreach (array_slice(preg_split('/\R/', $text), 0, 6) as $line) {
                if (preg_match('/^\s*(?:BAB|Bab|CHAPTER|Chapter)\s+(\d{1,3})\s*[·:.\-–]?\s*([^\s].*?)(?:\s{3,}.*)?$/u', $line, $m)) {
                    $num = $m[1];
                    if (!isset($seen[$num])) {
                        $seen[$num] = true;
                        $title = trim($m[2]) !== '' ? Str::title(Str::lower(trim($m[2], " .…"))) : "Bab {$num}";
                        // Kepala halaman biasanya muncul mulai halaman ke-2 bab → pembuka bab satu halaman sebelumnya.
                        $toc[] = ['title' => $title, 'page' => max(1, $i), 'level' => 1, 'number' => $num];
                    }
                    break;
                }
            }
        }
        usort($toc, fn ($a, $b) => $a['page'] <=> $b['page']);

        return $toc;
    }

    private function isRunningHeader(string $line): bool
    {
        $compact = Str::upper(preg_replace('/\s+/', '', $line));

        return str_contains($compact, 'DAFTARISI') || str_contains($compact, 'AMANIAPRESS') || preg_match('/^\d{1,4}$/', $line) === 1;
    }

    private function clean(string $text): string
    {
        // Normalisasi spasi berlebih tapi pertahankan baris (dibutuhkan pengurai daftar isi).
        $text = str_replace(["\r\n", "\r"], "\n", $text);

        return preg_replace('/[^\S\n]+$/m', '', $text) ?? $text;
    }

    /** Versi ringkas untuk disimpan & dicari: satu spasi, tanpa baris kosong berlebih. */
    private function forSearch(string $text): string
    {
        return trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
    }
}
