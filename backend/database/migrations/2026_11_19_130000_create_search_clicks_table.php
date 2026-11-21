<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Umpan balik klik pencarian: untuk kueri X, buku mana yang dipilih pengunjung.
 * Dipakai SmartSearch untuk menaikkan buku yang terbukti dicari orang dengan kata kunci itu.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('search_clicks', function (Blueprint $table) {
            $table->id();
            $table->string('query', 100);
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('clicks')->default(0);
            $table->timestamp('last_clicked_at')->nullable();
            $table->unique(['query', 'book_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('search_clicks');
    }
};
