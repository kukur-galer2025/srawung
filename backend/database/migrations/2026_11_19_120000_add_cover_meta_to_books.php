<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Metadata sampul untuk tampilan instan: daftar lebar varian WebP yang tersedia
 * (mis. [160, 320, 640]) dan placeholder buram mini (data URI ±300 byte).
 * Diisi otomatis saat sampul berubah; sampul lama: php artisan amania:cover-variants
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->json('cover_meta')->nullable()->after('cover_path');
        });
    }

    public function down(): void
    {
        Schema::table('books', fn (Blueprint $t) => $t->dropColumn('cover_meta'));
    }
};
