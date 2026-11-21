<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Voucher kreator bisa dibatasi ke buku tertentu milik kreator tsb.
 * `restrict_books` = true → hanya buku di tabel coupon_book yang mendapat diskon
 * (bila semua buku pilihan terhapus, voucher tidak otomatis berlaku untuk semua buku).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('coupons', function (Blueprint $table) {
            $table->boolean('restrict_books')->default(false)->after('creator_id');
        });

        Schema::create('coupon_book', function (Blueprint $table) {
            $table->foreignId('coupon_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->primary(['coupon_id', 'book_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coupon_book');
        Schema::table('coupons', function (Blueprint $table) {
            $table->dropColumn('restrict_books');
        });
    }
};
