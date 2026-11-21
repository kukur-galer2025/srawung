<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * - Reader: teks per halaman (pencarian), daftar isi, penanda halaman, catatan.
 * - Ulasan & rating pembeli, wishlist (+ email saat promo).
 * - Proteksi konten: jejak sesi & penanda aktivitas mencurigakan.
 * - Sumber pesanan (UTM/referrer) untuk analitik.
 * - Anonimisasi akun (hak hapus data, UU PDP).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('book_pages', function (Blueprint $table) {
            $table->longText('text')->nullable()->after('image_path');
        });

        Schema::table('books', function (Blueprint $table) {
            $table->json('toc')->nullable()->after('preview_pages');
            $table->decimal('rating_avg', 3, 2)->default(0)->after('toc');
            $table->unsignedInteger('rating_count')->default(0)->after('rating_avg');
        });

        Schema::create('reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('rating');
            $table->string('title', 120)->nullable();
            $table->text('body')->nullable();
            $table->boolean('is_hidden')->default(false);
            $table->string('hidden_reason', 200)->nullable();
            $table->timestamps();

            $table->unique(['book_id', 'user_id']);
            $table->index(['book_id', 'is_hidden', 'created_at']);
        });

        Schema::create('wishlists', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            // Penanda promo terakhir yang sudah diberitahukan (harga|berakhir) agar email tidak berulang.
            $table->string('notified_sale_key', 80)->nullable();
            $table->timestamp('notified_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['user_id', 'book_id']);
        });

        Schema::create('bookmarks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('page_number');
            $table->string('label', 120)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'book_id', 'page_number']);
        });

        Schema::create('reader_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('page_number');
            $table->text('body');
            $table->string('color', 16)->default('amber');
            $table->timestamps();

            $table->index(['user_id', 'book_id', 'page_number']);
        });

        Schema::table('reading_sessions', function (Blueprint $table) {
            $table->timestamp('last_seen_at')->nullable()->after('started_at');
            $table->string('ended_reason', 30)->nullable()->after('is_active');
            $table->index(['user_id', 'is_active']);
        });

        Schema::create('reader_flags', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reason', 40);
            $table->json('details')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'created_at']);
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->string('utm_source', 100)->nullable();
            $table->string('utm_medium', 100)->nullable();
            $table->string('utm_campaign', 100)->nullable();
            $table->string('referrer', 255)->nullable();
            $table->string('landing_page', 255)->nullable();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('anonymized_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('anonymized_at'));
        Schema::table('orders', fn (Blueprint $t) => $t->dropColumn(['utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'landing_page']));
        Schema::dropIfExists('reader_flags');
        Schema::table('reading_sessions', function (Blueprint $t) {
            $t->dropIndex(['user_id', 'is_active']);
            $t->dropColumn(['last_seen_at', 'ended_reason']);
        });
        Schema::dropIfExists('reader_notes');
        Schema::dropIfExists('bookmarks');
        Schema::dropIfExists('wishlists');
        Schema::dropIfExists('reviews');
        Schema::table('books', fn (Blueprint $t) => $t->dropColumn(['toc', 'rating_avg', 'rating_count']));
        Schema::table('book_pages', fn (Blueprint $t) => $t->dropColumn('text'));
    }
};
