<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** "Buku lanjutan" pilihan admin (mis. PHP → Laravel) — dasar rekomendasi "lanjut baca" saat data pembaca masih sedikit. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->foreignId('next_book_id')->nullable()->after('category_id')->constrained('books')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('books', fn (Blueprint $table) => $table->dropConstrainedForeignId('next_book_id'));
    }
};
