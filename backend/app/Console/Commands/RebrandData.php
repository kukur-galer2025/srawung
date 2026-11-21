<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Ganti sebutan "Amania" → "Srawung" pada KONTEN di database (banner, artikel, kategori,
 * paket, kupon, kampanye newsletter, pengaturan, nama akun admin).
 *
 *   php artisan srawung:rebrand-data            # hanya menampilkan yang akan diganti
 *   php artisan srawung:rebrand-data --apply    # terapkan
 *
 * Sengaja TIDAK diubah:
 *  - "Amania Press" (nama penerbit buku);
 *  - nama merchant QRIS & nama pemilik rekening (harus sama dengan data resmi bank/QRIS);
 *  - alamat email, slug/URL, dan path file.
 */
class RebrandData extends Command
{
    protected $signature = 'srawung:rebrand-data {--apply : Terapkan perubahan (tanpa opsi ini hanya pratinjau)}';

    protected $description = 'Ganti sebutan Amania menjadi Srawung pada konten di database';

    /** tabel => kolom kunci untuk laporan */
    private const TABLES = [
        'banners' => 'id', 'posts' => 'id', 'categories' => 'id', 'bundles' => 'id', 'coupons' => 'id',
        'newsletter_campaigns' => 'id', 'settings' => 'key', 'users' => 'id', 'creator_profiles' => 'id',
    ];

    /** Kolom yang tidak boleh disentuh. */
    private const SKIP_COLUMNS = ['email', 'slug', 'password', 'remember_token', 'token'];

    /** Pengaturan resmi pembayaran: harus sama persis dengan data bank/QRIS. */
    private const SKIP_SETTINGS = ['qris_merchant_name', 'qris_nmid', 'bank_holder', 'bank_name', 'bank_account'];

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $found = 0;

        foreach (self::TABLES as $table => $pk) {
            if (!Schema::hasTable($table)) {
                continue;
            }
            $columns = array_values(array_filter(Schema::getColumnListing($table), function ($c) use ($table) {
                if (in_array($c, self::SKIP_COLUMNS, true) || str_ends_with($c, '_path') || str_ends_with($c, '_url') || str_ends_with($c, '_id')) {
                    return false;
                }
                $type = strtolower((string) Schema::getColumnType($table, $c));

                return str_contains($type, 'char') || str_contains($type, 'text') || $type === 'string' || $type === 'json';
            }));
            if ($table === 'users') {
                $columns = ['name']; // hanya nama tampilan akun (mis. "Admin Amania")
            }

            foreach (DB::table($table)->get() as $row) {
                if ($table === 'settings' && in_array($row->key, self::SKIP_SETTINGS, true)) {
                    continue;
                }
                $changes = [];
                foreach ($columns as $col) {
                    $old = $row->{$col} ?? null;
                    if (!is_string($old) || stripos($old, 'amania') === false) {
                        continue;
                    }
                    $new = $this->rebrand($old);
                    if ($new !== $old) {
                        $changes[$col] = $new;
                        $found++;
                        $this->line(sprintf('%s #%s · %s: "%s" → "%s"', $table, $row->{$pk}, $col, $this->excerpt($old), $this->excerpt($new)));
                    }
                }
                if ($apply && $changes) {
                    DB::table($table)->where($pk, $row->{$pk})->update($changes);
                }
            }
        }

        if (!$found) {
            $this->info('Tidak ada konten yang masih menyebut Amania. 🎉');
        } elseif ($apply) {
            $this->info("{$found} teks diganti menjadi Srawung.");
        } else {
            $this->warn("{$found} teks akan diganti. Jalankan ulang dengan --apply untuk menerapkan.");
        }

        return self::SUCCESS;
    }

    /** "Amania" → "Srawung", kecuali "Amania Press" dan alamat/URL (amania.com, @amania…). */
    private function rebrand(string $text): string
    {
        $text = preg_replace('/\bAmania\.com\b/', 'Srawung', $text);
        $text = preg_replace('/(?<![@\/.\w-])AMANIA(?! PRESS| - SOFTWARE)\b/', 'SRAWUNG', $text);

        return preg_replace('/(?<![@\/.\w-])Amania(?!\s*Press)\b/', 'Srawung', $text);
    }

    private function excerpt(string $s): string
    {
        $s = trim(preg_replace('/\s+/', ' ', strip_tags($s)));
        $i = stripos($s, 'amania');
        $i = $i === false ? stripos($s, 'srawung') : $i;

        return mb_strimwidth(mb_substr($s, max(0, (int) $i - 30)), 0, 80, '…');
    }
}
