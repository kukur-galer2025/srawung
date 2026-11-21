<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Penarikan kreator: biaya admin per penarikan + jumlah bersih yang ditransfer, dan
 * persetujuan Syarat & Ketentuan Kreator (versi + waktu disetujui).
 * Ketentuan baru: minimal penarikan Rp100.000, biaya admin Rp5.000.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('creator_payouts', function (Blueprint $table) {
            $table->unsignedInteger('fee')->default(0)->after('amount');            // biaya admin
            $table->unsignedInteger('net_amount')->nullable()->after('fee');        // yang ditransfer = amount − fee
            $table->string('terms_version', 20)->nullable()->after('net_amount');   // versi S&K yang disetujui saat mengajukan
        });
        DB::table('creator_payouts')->whereNull('net_amount')->update(['net_amount' => DB::raw('amount')]);

        Schema::table('creator_profiles', function (Blueprint $table) {
            $table->string('terms_version', 20)->nullable();
            $table->timestamp('terms_accepted_at')->nullable();
        });

        $now = now();
        DB::table('settings')->updateOrInsert(['key' => 'creator_min_payout'], ['value' => '100000', 'updated_at' => $now, 'created_at' => $now]);
        DB::table('settings')->updateOrInsert(['key' => 'creator_payout_fee'], ['value' => '5000', 'updated_at' => $now, 'created_at' => $now]);
    }

    public function down(): void
    {
        Schema::table('creator_payouts', fn (Blueprint $t) => $t->dropColumn(['fee', 'net_amount', 'terms_version']));
        Schema::table('creator_profiles', fn (Blueprint $t) => $t->dropColumn(['terms_version', 'terms_accepted_at']));
        DB::table('settings')->where('key', 'creator_payout_fee')->delete();
    }
};
