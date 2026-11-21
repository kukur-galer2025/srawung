<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Zona waktu aplikasi berpindah dari UTC ke Asia/Jakarta (config/app.php).
 * Data lama tersimpan sebagai jam UTC, jadi semua kolom tanggal-waktu digeser
 * +7 jam agar tetap menunjuk ke momen yang sama. Tabel kosong (instalasi baru)
 * tidak terpengaruh. Hanya MySQL/MariaDB; SQLite (test) selalu dibuat baru.
 */
return new class extends Migration
{
    private const HOURS = 7;

    public function up(): void
    {
        $this->shift(self::HOURS);
    }

    public function down(): void
    {
        $this->shift(-self::HOURS);
    }

    private function shift(int $hours): void
    {
        $driver = DB::connection()->getDriverName();
        if (!in_array($driver, ['mysql', 'mariadb'], true)) {
            return;
        }

        $columns = DB::select(
            "select table_name as t, column_name as c from information_schema.columns
             where table_schema = database() and data_type in ('timestamp', 'datetime')
             and table_name <> 'migrations'"
        );

        $byTable = [];
        foreach ($columns as $col) {
            $byTable[$col->t][] = $col->c;
        }

        foreach ($byTable as $table => $cols) {
            $sets = implode(', ', array_map(
                fn ($c) => "`{$c}` = IF(`{$c}` IS NULL, NULL, `{$c}` + INTERVAL {$hours} HOUR)",
                $cols,
            ));
            DB::statement("UPDATE `{$table}` SET {$sets}");
        }
    }
};
