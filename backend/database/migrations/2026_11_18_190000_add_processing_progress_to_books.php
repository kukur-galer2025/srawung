<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Progres konversi PDF → halaman (ditampilkan langsung di daftar buku admin/kreator). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->unsignedInteger('processing_pages_done')->nullable()->after('processing_error');
            $table->unsignedInteger('processing_pages_total')->nullable()->after('processing_pages_done');
            $table->timestamp('processing_started_at')->nullable()->after('processing_pages_total');
            $table->timestamp('processing_finished_at')->nullable()->after('processing_started_at');
        });
    }

    public function down(): void
    {
        Schema::table('books', function (Blueprint $table) {
            $table->dropColumn(['processing_pages_done', 'processing_pages_total', 'processing_started_at', 'processing_finished_at']);
        });
    }
};
