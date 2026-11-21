<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            // Status konversi PDF → halaman: null (belum ada PDF) | pending | processing | done | failed
            $table->string('processing_status', 20)->nullable()->after('source_file_path');
            $table->text('processing_error')->nullable()->after('processing_status');
        });
    }

    public function down(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->dropColumn(['processing_status', 'processing_error']);
        });
    }
};
