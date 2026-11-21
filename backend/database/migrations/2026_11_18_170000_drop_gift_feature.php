<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Fitur "kirim sebagai hadiah" dihapus: tabel gifts dan kolom hadiah di orders. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('gifts');

        $columns = array_values(array_filter(
            ['is_gift', 'gift_recipient_name', 'gift_recipient_email', 'gift_message'],
            fn ($c) => Schema::hasColumn('orders', $c),
        ));
        if ($columns) {
            Schema::table('orders', fn (Blueprint $table) => $table->dropColumn($columns));
        }
    }

    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->boolean('is_gift')->default(false)->after('status');
            $table->string('gift_recipient_name')->nullable()->after('is_gift');
            $table->string('gift_recipient_email')->nullable()->after('gift_recipient_name');
            $table->text('gift_message')->nullable()->after('gift_recipient_email');
        });
    }
};
