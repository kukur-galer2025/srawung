<?php

namespace App\Services;

use App\Models\PaymentProof;
use Illuminate\Support\Facades\Storage;

/**
 * Pemeriksa bukti pembayaran: mendeteksi bukti yang dipakai ulang untuk pesanan lain.
 *
 *  - Identik : SHA-256 isi file sama persis (file yang sama diunggah lagi).
 *  - Mirip   : dHash 256-bit (gambar diperkecil ke 17×16 abu-abu, tiap piksel dibandingkan
 *              dengan tetangga kanannya). Tahan terhadap kompresi ulang, ubah ukuran, dan
 *              screenshot ulang. Jarak Hamming ≤ NEAR_BITS dianggap "sangat mirip".
 *  - Tanda risiko lain: akun baru (< 24 jam), bukti diunggah < 1 menit setelah pesanan dibuat.
 *
 * Hasilnya hanya PERINGATAN untuk admin, bukan penolakan otomatis: struk dari aplikasi
 * e-wallet yang sama bisa berpenampilan mirip, jadi admin tetap mencocokkan dengan mutasi.
 */
class ProofInspector
{
    /** Ambang jarak Hamming (dari 256 bit) untuk "sangat mirip" ≈ 96% sama. */
    public const NEAR_BITS = 10;

    /** Selisih kecerahan (0–255) yang dianggap "sama" saat membandingkan piksel bertetangga. */
    private const FLAT_TOLERANCE = 3;

    /** Bukti lama yang dibandingkan (hari). */
    public const LOOKBACK_DAYS = 365;

    /** @return array{file_hash: string, phash: ?string} */
    public function fingerprint(string $absolutePath): array
    {
        return ['file_hash' => hash_file('sha256', $absolutePath), 'phash' => $this->dhash($absolutePath)];
    }

    /** Hitung sidik jari, cari bukti serupa di pesanan lain, lalu simpan tandanya. */
    public function inspect(PaymentProof $proof): PaymentProof
    {
        $disk = Storage::disk('local');
        if (!$disk->exists($proof->file_path)) {
            return $proof;
        }
        $fp = $this->fingerprint($disk->path($proof->file_path));
        $order = $proof->order()->with('user')->first();

        $match = $this->findMatch($proof, $fp);
        $flags = [];
        if ($match) {
            $flags[] = $match['similarity'] === 100 ? 'bukti_identik' : 'bukti_mirip';
        }
        if ($order?->user && $order->user->created_at && $order->user->created_at->gt(now()->subDay())) {
            $flags[] = 'akun_baru';
        }
        if ($order && $order->created_at && $proof->created_at && $order->created_at->diffInSeconds($proof->created_at) < 60) {
            $flags[] = 'unggah_terlalu_cepat';
        }

        $proof->forceFill([
            'file_hash' => $fp['file_hash'],
            'phash' => $fp['phash'],
            'duplicate_of_id' => $match['proof']->id ?? null,
            'similarity' => $match['similarity'] ?? null,
            'risk_flags' => $flags ?: null,
        ])->save();

        return $proof;
    }

    /**
     * Ringkasan untuk admin: bukti mana yang mirip, milik pesanan & akun apa, dan statusnya.
     *
     * @return array{flags: list<string>, match: ?array}
     */
    public static function summary(PaymentProof $proof): array
    {
        $match = null;
        if ($proof->duplicate_of_id && ($other = PaymentProof::with('order.user:id,name,email')->find($proof->duplicate_of_id))) {
            $order = $other->order;
            $match = [
                'proof_id' => $other->id,
                'similarity' => (int) $proof->similarity,
                'order_id' => $order?->id,
                'order_number' => $order?->order_number,
                'order_status' => $order?->status,
                'same_buyer' => $order && $proof->order && $order->user_id === $proof->order->user_id,
                'buyer_name' => $order?->user?->name,
                'uploaded_at' => $other->created_at?->toIso8601String(),
            ];
        }

        return ['flags' => $proof->risk_flags ?? [], 'match' => $match];
    }

    /* ------------------------------------------------------------------ */

    /** @return array{proof: PaymentProof, similarity: int}|null */
    private function findMatch(PaymentProof $proof, array $fp): ?array
    {
        $others = PaymentProof::where('order_id', '!=', $proof->order_id)
            ->where('created_at', '>=', now()->subDays(self::LOOKBACK_DAYS))
            ->whereNotNull('file_hash');

        $exact = (clone $others)->where('file_hash', $fp['file_hash'])->orderBy('id')->first();
        if ($exact) {
            return ['proof' => $exact, 'similarity' => 100];
        }
        if (!$fp['phash']) {
            return null;
        }

        $best = null;
        foreach ((clone $others)->whereNotNull('phash')->orderByDesc('id')->limit(5000)->get(['id', 'order_id', 'phash']) as $other) {
            $d = self::hamming($fp['phash'], $other->phash);
            if ($d <= self::NEAR_BITS && ($best === null || $d < $best['d'])) {
                $best = ['proof' => $other, 'd' => $d];
            }
        }

        return $best ? ['proof' => $best['proof'], 'similarity' => (int) floor((256 - $best['d']) / 256 * 100)] : null;
    }

    /** dHash 256-bit sebagai 64 karakter hex; null untuk file yang bukan gambar (PDF). */
    private function dhash(string $path): ?string
    {
        if (!function_exists('imagecreatefromstring')) {
            return null;
        }
        $data = @file_get_contents($path);
        $img = $data !== false ? @imagecreatefromstring($data) : false;
        if (!$img) {
            return null;
        }

        $w = 17;
        $h = 16;
        $small = imagecreatetruecolor($w, $h);
        imagecopyresampled($small, $img, 0, 0, 0, 0, $w, $h, imagesx($img), imagesy($img));
        imagedestroy($img);

        $bits = '';
        for ($y = 0; $y < $h; $y++) {
            $prev = null;
            for ($x = 0; $x < $w; $x++) {
                $rgb = imagecolorat($small, $x, $y);
                $gray = (($rgb >> 16) & 0xFF) * 0.299 + (($rgb >> 8) & 0xFF) * 0.587 + ($rgb & 0xFF) * 0.114;
                if ($prev !== null) {
                    // Toleransi kecil: di area polos (latar putih struk) selisih ±2 hanyalah noise
                    // kompresi — tanpa toleransi bit-bit ini berbalik acak antar-salinan.
                    $bits .= $gray > $prev + self::FLAT_TOLERANCE ? '1' : '0';
                }
                $prev = $gray;
            }
        }
        imagedestroy($small);

        $hex = '';
        foreach (str_split($bits, 4) as $nibble) {
            $hex .= dechex(bindec($nibble));
        }

        return $hex;
    }

    /** Jarak Hamming dua hash hex (dibandingkan per 32 bit agar aman dari overflow). */
    public static function hamming(string $a, string $b): int
    {
        if (strlen($a) !== strlen($b)) {
            return PHP_INT_MAX;
        }
        $d = 0;
        foreach (str_split($a, 8) as $i => $chunk) {
            $d += substr_count(decbin(hexdec($chunk) ^ hexdec(substr($b, $i * 8, 8))), '1');
        }

        return $d;
    }

    /** Label tanda risiko untuk ditampilkan. */
    public const FLAG_LABELS = [
        'bukti_identik' => 'File bukti identik dengan bukti pesanan lain',
        'bukti_mirip' => 'Gambar bukti sangat mirip dengan bukti pesanan lain',
        'akun_baru' => 'Akun pembeli dibuat kurang dari 24 jam lalu',
        'unggah_terlalu_cepat' => 'Bukti diunggah kurang dari 1 menit setelah pesanan dibuat',
    ];
}
