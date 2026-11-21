<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 1. Refund pesanan + koreksi saldo kreator.
 * 2. Sidik jari bukti pembayaran (deteksi bukti dipakai ulang) + tanda risiko.
 * 3. Laporan pelanggaran hak cipta / konten.
 * 4. Peristiwa "masuk keranjang" per buku untuk analitik kreator.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            // enum → string agar status baru ("dikembalikan") tidak perlu ALTER enum lagi.
            $table->string('status', 30)->default('menunggu_pembayaran')->change();
            $table->timestamp('refunded_at')->nullable();
            $table->foreignId('refunded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('refund_reason', 500)->nullable();
            $table->string('refund_reference', 120)->nullable();
        });

        Schema::table('creator_earnings', function (Blueprint $table) {
            $table->timestamp('reversed_at')->nullable();
            $table->string('reversal_reason', 255)->nullable();
        });

        Schema::table('payment_proofs', function (Blueprint $table) {
            $table->string('file_hash', 64)->nullable()->index();   // SHA-256 isi file → bukti identik
            $table->string('phash', 64)->nullable();                 // dHash 256-bit → gambar mirip (dikompres/di-screenshot ulang)
            $table->unsignedBigInteger('duplicate_of_id')->nullable();
            $table->unsignedTinyInteger('similarity')->nullable();   // 0–100
            $table->json('risk_flags')->nullable();
        });

        Schema::create('book_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('reporter_name', 120);
            $table->string('reporter_email', 190);
            $table->string('type', 30);           // hak_cipta | konten_terlarang | lainnya
            $table->string('relationship', 30);   // pemilik | kuasa | pembaca
            $table->text('description');
            $table->string('evidence_url', 500)->nullable();
            $table->string('status', 20)->default('baru'); // baru | ditinjau | diterima | ditolak
            $table->text('admin_note')->nullable();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->string('ip', 45)->nullable();
            $table->timestamps();
            $table->index(['status', 'created_at']);
        });

        Schema::create('book_events', function (Blueprint $table) {
            $table->id();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->string('type', 20);           // cart
            $table->string('visitor', 64);        // id pengguna atau hash anonim
            $table->date('date');
            $table->unique(['book_id', 'type', 'visitor', 'date']);
            $table->index(['book_id', 'type', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('book_events');
        Schema::dropIfExists('book_reports');
        Schema::table('payment_proofs', fn (Blueprint $t) => $t->dropColumn(['file_hash', 'phash', 'duplicate_of_id', 'similarity', 'risk_flags']));
        Schema::table('creator_earnings', fn (Blueprint $t) => $t->dropColumn(['reversed_at', 'reversal_reason']));
        Schema::table('orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('refunded_by');
            $table->dropColumn(['refunded_at', 'refund_reason', 'refund_reference']);
        });
    }
};
