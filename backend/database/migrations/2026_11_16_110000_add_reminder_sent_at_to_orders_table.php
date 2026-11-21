<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // Kapan email pengingat batas bayar terakhir dikirim (null = belum untuk tenggat saat ini).
            $table->timestamp('reminder_sent_at')->nullable()->after('payment_deadline');
        });
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn('reminder_sent_at');
        });
    }
};
