<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Role kreator: kreator mengunggah & menjual bukunya sendiri, membuat voucher khusus
 * bukunya, dan menarik pendapatan (setelah komisi Amania).
 *
 *  - users.role         : buyer | creator | admin (sebelumnya enum buyer/admin)
 *  - creator_profiles   : nama pena, bio, komisi khusus (opsional), rekening pencairan
 *  - books.creator_id   : pemilik buku (null = buku milik Amania)
 *  - coupons.creator_id : voucher kreator — hanya berlaku untuk buku kreator tsb.
 *  - order_items.discount : bagian diskon kupon per buku (dasar bagi hasil yang adil)
 *  - creator_earnings   : buku besar pendapatan per buku terjual
 *  - creator_payouts    : pengajuan penarikan saldo
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 20)->default('buyer')->change();
        });

        Schema::create('creator_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('display_name');
            $table->text('bio')->nullable();
            // Null = memakai komisi umum dari Pengaturan.
            $table->unsignedTinyInteger('commission_percent')->nullable();
            $table->string('payout_method', 20)->nullable(); // bank | ewallet
            $table->string('payout_provider', 60)->nullable(); // BCA, BRI, DANA, OVO, …
            $table->string('payout_account', 60)->nullable();
            $table->string('payout_holder', 120)->nullable();
            $table->timestamps();
        });

        Schema::table('books', function (Blueprint $table) {
            $table->foreignId('creator_id')->nullable()->after('id')->constrained('users')->nullOnDelete();
        });

        Schema::table('coupons', function (Blueprint $table) {
            $table->foreignId('creator_id')->nullable()->after('id')->constrained('users')->cascadeOnDelete();
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->unsignedInteger('discount')->default(0)->after('price');
        });

        Schema::create('creator_earnings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('order_id')->constrained()->cascadeOnDelete();
            $table->foreignId('order_item_id')->unique()->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedInteger('gross');               // harga dibayar pembeli untuk buku ini
            $table->unsignedTinyInteger('commission_percent');
            $table->unsignedInteger('commission');          // bagian Amania
            $table->unsignedInteger('net');                 // bagian kreator
            $table->timestamps();
            $table->index(['creator_id', 'created_at']);
        });

        Schema::create('creator_payouts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('creator_id')->constrained('users')->cascadeOnDelete();
            $table->unsignedInteger('amount');
            $table->string('status', 20)->default('requested'); // requested | paid | rejected
            $table->string('payout_method', 20);
            $table->string('payout_provider', 60);
            $table->string('payout_account', 60);
            $table->string('payout_holder', 120);
            $table->string('reference')->nullable();   // no. referensi transfer dari admin
            $table->string('proof_path')->nullable();
            $table->text('note')->nullable();          // catatan/alasan penolakan admin
            $table->foreignId('processed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('processed_at')->nullable();
            $table->timestamps();
            $table->index(['creator_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('creator_payouts');
        Schema::dropIfExists('creator_earnings');
        Schema::table('order_items', fn (Blueprint $t) => $t->dropColumn('discount'));
        Schema::table('coupons', fn (Blueprint $t) => $t->dropConstrainedForeignId('creator_id'));
        Schema::table('books', fn (Blueprint $t) => $t->dropConstrainedForeignId('creator_id'));
        Schema::dropIfExists('creator_profiles');
        Schema::table('users', function (Blueprint $table) {
            $table->enum('role', ['buyer', 'admin'])->default('buyer')->change();
        });
    }
};
