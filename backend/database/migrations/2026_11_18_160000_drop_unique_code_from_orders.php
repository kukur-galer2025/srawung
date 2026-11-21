<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kode unik pembayaran (Rp100–999 yang ditambahkan ke total) tidak dipakai lagi:
 * pembeli membayar tepat sesuai harga buku, dan pembayaran dicocokkan lewat bukti
 * transfer yang diunggah per pesanan. Total pesanan lama tetap seperti tercatat.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('unique_code');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->smallInteger('unique_code')->default(0)->after('total');
        });
    }
};
