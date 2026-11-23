<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pengerasan keamanan:
 *  - users: verifikasi dua langkah (TOTP). Rahasia & kode pemulihan disimpan terenkripsi.
 *  - creator_profiles.payout_changed_at: kapan rekening pencairan terakhir diganti (jeda penarikan).
 *  - reading_sessions: token sesi baca kini disimpan sebagai hash. Sesi lama ditutup
 *    (pembaca cukup memuat ulang halaman).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->text('two_factor_secret')->nullable();
            $table->text('two_factor_recovery')->nullable();
            $table->timestamp('two_factor_confirmed_at')->nullable();
            // Langkah waktu terakhir yang dipakai → satu kode tidak bisa dipakai dua kali.
            $table->unsignedBigInteger('two_factor_last_step')->nullable();
        });

        Schema::table('creator_profiles', function (Blueprint $table) {
            $table->timestamp('payout_changed_at')->nullable();
        });

        DB::table('reading_sessions')->where('is_active', true)->update(['is_active' => false, 'ended_reason' => 'security']);
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn(['two_factor_secret', 'two_factor_recovery', 'two_factor_confirmed_at', 'two_factor_last_step']));
        Schema::table('creator_profiles', fn (Blueprint $t) => $t->dropColumn('payout_changed_at'));
    }
};
