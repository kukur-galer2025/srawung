<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fitur etalase toko: harga promo per buku, kupon yang dipajang publik,
 * banner iklan beranda, dan blog/artikel.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            // Harga coret: berlaku bila diisi, lebih kecil dari harga normal, dan belum lewat sale_ends_at.
            $table->unsignedInteger('sale_price')->nullable()->after('price');
            $table->timestamp('sale_ends_at')->nullable()->after('sale_price');
        });

        Schema::table('coupons', function (Blueprint $table) {
            // Kupon publik tampil di halaman Promo; kupon privat hanya untuk yang tahu kodenya.
            $table->boolean('is_public')->default(false)->after('expires_at');
            $table->string('description', 160)->nullable()->after('is_public');
        });

        Schema::create('banners', function (Blueprint $table) {
            $table->id();
            $table->string('eyebrow', 40)->nullable();      // label kecil, mis. "PROMO PEKAN INI"
            $table->string('title', 120);
            $table->string('subtitle', 255)->nullable();
            $table->string('cta_label', 40)->nullable();
            $table->string('link_url', 255)->nullable();     // path internal (/buku/...) atau URL penuh
            $table->string('image_path')->nullable();        // gambar di sisi kanan (sampul/ilustrasi)
            $table->string('theme', 20)->default('blue');   // preset warna latar
            $table->unsignedInteger('sort_order')->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        Schema::create('posts', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->string('tag', 40)->nullable();          // mis. "Tips Belajar", "Persiapan Ujian"
            $table->text('excerpt')->nullable();
            $table->longText('body');                        // Markdown
            $table->string('cover_path')->nullable();
            $table->foreignId('book_id')->nullable()->constrained()->nullOnDelete(); // buku yang direkomendasikan di artikel
            $table->foreignId('author_id')->nullable()->constrained('users')->nullOnDelete();
            $table->enum('status', ['draft', 'published'])->default('draft');
            $table->timestamp('published_at')->nullable();
            $table->unsignedInteger('views')->default(0);
            $table->timestamps();

            $table->index(['status', 'published_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('posts');
        Schema::dropIfExists('banners');
        Schema::table('coupons', function (Blueprint $table) {
            $table->dropColumn(['is_public', 'description']);
        });
        Schema::table('books', function (Blueprint $table) {
            $table->dropColumn(['sale_price', 'sale_ends_at']);
        });
    }
};
