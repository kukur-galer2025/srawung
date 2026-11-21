<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 1. Log pencarian katalog (agregat per hari) → admin tahu buku apa yang dicari tapi belum ada.
 * 2. Waktu terakhir membaca & pengingat "lanjutkan membaca" per buku di perpustakaan.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('search_query_daily', function (Blueprint $table) {
            $table->id();
            $table->date('date');
            $table->string('query', 100);
            $table->unsignedInteger('searches')->default(0);
            $table->unsignedInteger('results')->default(0); // jumlah hasil pada pencarian terakhir hari itu
            $table->timestamp('last_searched_at')->nullable();
            $table->unique(['date', 'query']);
            $table->index('query');
        });

        Schema::table('user_library', function (Blueprint $table) {
            $table->timestamp('last_read_at')->nullable()->after('last_read_page');
            $table->timestamp('resume_reminded_at')->nullable()->after('last_read_at');
            $table->index(['access_status', 'last_read_at']);
        });

        // Perkiraan awal: progres yang sudah ada dianggap terakhir dibaca saat baris terakhir diubah.
        DB::table('user_library')->where('last_read_page', '>', 1)->update(['last_read_at' => DB::raw('updated_at')]);
    }

    public function down(): void
    {
        Schema::table('user_library', function (Blueprint $table) {
            $table->dropIndex(['access_status', 'last_read_at']);
            $table->dropColumn(['last_read_at', 'resume_reminded_at']);
        });
        Schema::dropIfExists('search_query_daily');
    }
};
