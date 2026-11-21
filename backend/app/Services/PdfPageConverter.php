<?php

namespace App\Services;

use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use RuntimeException;

/**
 * Mengubah file PDF menjadi gambar per halaman memakai alat baris-perintah:
 * Poppler (pdftoppm) atau Ghostscript (gs). Tidak butuh ekstensi PHP Imagick.
 *
 * Windows : winget install oschwartz10612.Poppler
 * Linux   : apt install poppler-utils   (atau: apt install ghostscript)
 */
class PdfPageConverter
{
    private const PAGE_WIDTH = 1300; // piksel
    private const TIMEOUT = 1800;    // detik

    /**
     * @return array{engine: 'poppler'|'ghostscript', path: string}|null
     */
    public function detect(): ?array
    {
        foreach ($this->candidates() as $path) {
            $engine = $this->engineOf($path);
            if ($engine && $this->runs($path)) {
                return ['engine' => $engine, 'path' => $path];
            }
        }

        return null;
    }

    /**
     * Jumlah halaman PDF (pdfinfo dari Poppler, atau Ghostscript). Null bila tak bisa
     * dihitung — konversi tetap berjalan, hanya progres tampil tanpa total.
     */
    public function pageCount(string $pdfPath): ?int
    {
        $tool = $this->detect();
        if (!$tool) {
            return null;
        }

        try {
            if ($tool['engine'] === 'poppler') {
                $dir = dirname($tool['path']);
                $pdfinfo = $dir === '.' ? 'pdfinfo' : $dir . DIRECTORY_SEPARATOR . 'pdfinfo' . (PHP_OS_FAMILY === 'Windows' && str_ends_with(strtolower($tool['path']), '.exe') ? '.exe' : '');
                $out = Process::timeout(60)->run([$pdfinfo, $pdfPath]);
                if ($out->successful() && preg_match('/^Pages:\s+(\d+)/m', $out->output(), $m)) {
                    return (int) $m[1] ?: null;
                }

                return null;
            }

            $path = str_replace(['\\', '(', ')'], ['/', '\\(', '\\)'], $pdfPath);
            $out = Process::timeout(60)->run([
                $tool['path'], '-q', '-dNODISPLAY', '-dNOSAFER', '-dQUIET',
                '-c', "({$path}) (r) file runpdfbegin pdfpagecount = quit",
            ]);
            $n = (int) trim($out->output());

            return $out->successful() && $n > 0 ? $n : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Render semua halaman PDF ke $outputDir sebagai page_1.jpg, page_2.jpg, ...
     * $onProgress(int $halamanSelesai) dipanggil berkala selama proses berjalan.
     *
     * @param  (callable(int): void)|null  $onProgress
     * @return list<string> path absolut file halaman, urut dari halaman 1
     */
    public function convert(string $pdfPath, string $outputDir, ?callable $onProgress = null): array
    {
        $tool = $this->detect();
        if (!$tool) {
            throw new RuntimeException(
                'Alat konversi PDF tidak ditemukan di server. Pasang Poppler (pdftoppm) atau Ghostscript, '
                . 'atau isi PDF_CONVERTER_PATH di file .env.'
            );
        }

        File::ensureDirectoryExists($outputDir);

        $command = $tool['engine'] === 'poppler'
            ? [
                $tool['path'], '-jpeg', '-jpegopt', 'quality=88',
                '-scale-to-x', (string) self::PAGE_WIDTH, '-scale-to-y', '-1',
                $pdfPath, $outputDir . DIRECTORY_SEPARATOR . 'raw',
            ]
            : [
                $tool['path'], '-dSAFER', '-dBATCH', '-dNOPAUSE', '-dQUIET',
                '-sDEVICE=jpeg', '-dJPEGQ=88', '-r150', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4',
                '-sOutputFile=' . $outputDir . DIRECTORY_SEPARATOR . 'raw-%d.jpg',
                $pdfPath,
            ];

        $process = Process::timeout(self::TIMEOUT)->start($command);
        $pattern = $outputDir . DIRECTORY_SEPARATOR . 'raw-*.jpg';
        $reported = -1;
        while ($process->running()) {
            usleep(500_000);
            if (method_exists($process, 'ensureNotTimedOut')) {
                $process->ensureNotTimedOut();
            }
            if ($onProgress) {
                // File terbaru mungkin masih ditulis, jadi belum dihitung selesai.
                $done = max(0, count(glob($pattern) ?: []) - 1);
                if ($done !== $reported) {
                    $onProgress($reported = $done);
                }
            }
        }
        $result = $process->wait();

        $files = glob($outputDir . DIRECTORY_SEPARATOR . 'raw-*.jpg') ?: [];
        // pdftoppm memberi nama raw-01.jpg / raw-001.jpg; urutkan secara numerik.
        usort($files, fn ($a, $b) => $this->pageNumber($a) <=> $this->pageNumber($b));

        if ($result->failed() || !$files) {
            $detail = trim($result->errorOutput() ?: $result->output());
            throw new RuntimeException(
                'PDF tidak dapat dikonversi. Pastikan file tidak rusak dan tidak dikunci kata sandi.'
                . ($detail ? ' Detail: ' . mb_substr($detail, 0, 300) : '')
            );
        }

        $onProgress && $onProgress(count($files));

        $pages = [];
        foreach ($files as $i => $file) {
            $target = $outputDir . DIRECTORY_SEPARATOR . 'page_' . ($i + 1) . '.jpg';
            File::move($file, $target);
            $pages[] = $target;
        }

        return $pages;
    }

    /** @return list<string> */
    private function candidates(): array
    {
        $list = [];

        if ($configured = config('services.pdf.converter_path')) {
            $list[] = $configured;
        }

        // Nama perintah di PATH.
        array_push($list, 'pdftoppm', 'gs', 'gswin64c', 'gswin32c');

        // Lokasi pemasangan umum di Windows (PATH sering belum diperbarui).
        if (PHP_OS_FAMILY === 'Windows') {
            $local = getenv('LOCALAPPDATA') ?: '';
            if ($local) {
                $list = array_merge(
                    $list,
                    glob($local . '\Microsoft\WinGet\Packages\oschwartz10612.Poppler*\*\Library\bin\pdftoppm.exe') ?: [],
                );
            }
            $list = array_merge($list, array_reverse(glob('C:\Program Files\gs\*\bin\gswin64c.exe') ?: []));
        }

        return array_values(array_unique($list));
    }

    private function engineOf(string $path): ?string
    {
        $name = strtolower(pathinfo($path, PATHINFO_FILENAME));

        return match (true) {
            str_contains($name, 'pdftoppm') => 'poppler',
            $name === 'gs', str_starts_with($name, 'gswin') => 'ghostscript',
            default => null,
        };
    }

    private function runs(string $path): bool
    {
        try {
            return Process::timeout(10)->run([$path, '-v'])->successful();
        } catch (\Throwable) {
            return false;
        }
    }

    private function pageNumber(string $file): int
    {
        return preg_match('/raw-(\d+)\.jpg$/', $file, $m) ? (int) $m[1] : 0;
    }
}
