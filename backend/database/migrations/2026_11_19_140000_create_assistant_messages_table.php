<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Log tanya-jawab RoboNia untuk mutu layanan: penilaian 👍/👎, pertanyaan yang gagal
 * dijawab, dan buku yang dicari tapi belum ada. Disimpan 90 hari (dihapus otomatis).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assistant_messages', function (Blueprint $table) {
            $table->id();
            $table->string('session_id', 40)->nullable()->index();   // id obrolan di browser (untuk menilai jawaban sendiri)
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('page_book', 150)->nullable();              // slug buku yang sedang dibuka
            $table->text('question');
            $table->text('answer');
            $table->string('provider', 20)->nullable();
            $table->json('tools')->nullable();                          // alat yang dipakai
            $table->json('missing')->nullable();                        // kata kunci buku yang tidak ditemukan
            $table->boolean('failed')->default(false);
            $table->tinyInteger('rating')->nullable();                  // 1 = 👍, -1 = 👎
            $table->string('feedback', 200)->nullable();
            $table->timestamps();
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assistant_messages');
    }
};
