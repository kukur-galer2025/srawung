<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * - Artikel blog bisa ditulis dengan editor visual (HTML tersanitasi) selain Markdown.
 * - Sinyal untuk mesin rekomendasi: riwayat lihat buku & topik favorit pembaca.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            $table->string('format', 10)->default('markdown')->after('body'); // markdown | html
        });

        Schema::table('users', function (Blueprint $table) {
            $table->json('preferred_categories')->nullable()->after('role');
        });

        // Riwayat lihat halaman buku (tanpa IP — hanya akun bila login).
        Schema::create('book_views', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['book_id', 'created_at']);
            $table->index(['user_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_views');
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('preferred_categories'));
        Schema::table('posts', fn (Blueprint $table) => $table->dropColumn('format'));
    }
};
