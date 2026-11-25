<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Sesi baca terikat ke perangkat (id acak yang disimpan peramban pembaca):
 *  - token sesi tidak bisa dipakai di perangkat lain;
 *  - jumlah perangkat yang membaca bersamaan per akun bisa dibatasi (Pengaturan → batas perangkat).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('reading_sessions', function (Blueprint $table) {
            $table->string('device_id', 64)->nullable()->after('device');
            $table->index(['user_id', 'is_active', 'device_id']);
        });
    }

    public function down(): void
    {
        Schema::table('reading_sessions', function (Blueprint $table) {
            $table->dropIndex(['user_id', 'is_active', 'device_id']);
            $table->dropColumn('device_id');
        });
    }
};
