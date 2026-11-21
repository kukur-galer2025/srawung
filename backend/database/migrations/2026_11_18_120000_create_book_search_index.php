<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Indeks kata (inverted index) untuk "Cari di dalam semua buku" (BM25).
 *  - search_postings : kata → halaman tempat kata itu muncul (+ frekuensinya)
 *  - search_terms    : kosakata + jumlah halaman yang memuatnya (df), juga untuk koreksi salah ketik
 *  - book_pages.token_count : panjang halaman (dipakai normalisasi panjang dokumen BM25)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('search_postings', function (Blueprint $table) {
            $table->id();
            $table->string('term', 40);
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_page_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('page_number');
            $table->unsignedSmallInteger('tf');
            $table->index('term');
            $table->index('book_id');
        });

        Schema::create('search_terms', function (Blueprint $table) {
            $table->string('term', 40)->primary();
            $table->unsignedInteger('df');
        });

        Schema::table('book_pages', function (Blueprint $table) {
            $table->unsignedInteger('token_count')->default(0)->after('text');
        });
    }

    public function down(): void
    {
        Schema::table('book_pages', fn (Blueprint $table) => $table->dropColumn('token_count'));
        Schema::dropIfExists('search_terms');
        Schema::dropIfExists('search_postings');
    }
};
