<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fitur pertumbuhan penjualan:
 *  - Paket bundel (bundles, bundle_book, order_items.bundle_id)
 *  - Hadiah buku (orders.is_gift + gift_*, gifts)
 *  - Pengingat keranjang (carts, users.reminder_emails)
 *  - Newsletter (newsletter_subscribers, newsletter_campaigns)
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('bundles', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            $table->unsignedInteger('price');
            $table->boolean('is_active')->default(true);
            $table->timestamp('starts_at')->nullable();
            $table->timestamp('ends_at')->nullable();
            $table->integer('sort')->default(0);
            $table->timestamps();
        });

        Schema::create('bundle_book', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bundle_id')->constrained()->cascadeOnDelete();
            $table->foreignId('book_id')->constrained()->cascadeOnDelete();
            $table->integer('sort')->default(0);
            $table->unique(['bundle_id', 'book_id']);
        });

        Schema::table('order_items', function (Blueprint $table) {
            $table->foreignId('bundle_id')->nullable()->after('book_id')->constrained()->nullOnDelete();
        });

        Schema::table('orders', function (Blueprint $table) {
            $table->boolean('is_gift')->default(false)->after('status');
            $table->string('gift_recipient_name')->nullable()->after('is_gift');
            $table->string('gift_recipient_email')->nullable()->after('gift_recipient_name');
            $table->text('gift_message')->nullable()->after('gift_recipient_email');
        });

        Schema::create('gifts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('token', 64)->unique();
            $table->string('recipient_name');
            $table->string('recipient_email');
            $table->text('message')->nullable();
            $table->foreignId('claimed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('claimed_at')->nullable();
            $table->timestamp('sent_at')->nullable();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            // Pengingat keranjang & kabar promo wishlist (bisa dimatikan dari email/Profil).
            $table->boolean('reminder_emails')->default(true)->after('role');
        });

        Schema::create('carts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->json('book_ids')->nullable();
            $table->json('bundle_ids')->nullable();
            $table->timestamp('content_updated_at')->nullable();
            $table->unsignedTinyInteger('reminder_count')->default(0);
            $table->timestamp('reminded_at')->nullable();
            $table->timestamps();
            $table->index(['reminder_count', 'content_updated_at']);
        });

        Schema::create('newsletter_subscribers', function (Blueprint $table) {
            $table->id();
            $table->string('email')->unique();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('token', 64)->unique();
            $table->string('status', 20)->default('pending'); // pending | subscribed | unsubscribed
            $table->string('source', 30)->nullable();
            $table->timestamp('confirmed_at')->nullable();
            $table->timestamp('unsubscribed_at')->nullable();
            $table->timestamps();
            $table->index('status');
        });

        Schema::create('newsletter_campaigns', function (Blueprint $table) {
            $table->id();
            $table->string('subject');
            $table->string('preheader')->nullable();
            $table->longText('body');
            $table->string('status', 20)->default('draft'); // draft | sending | sent
            $table->unsignedInteger('recipients_count')->default(0);
            $table->timestamp('sent_at')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('newsletter_campaigns');
        Schema::dropIfExists('newsletter_subscribers');
        Schema::dropIfExists('carts');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('reminder_emails');
        });
        Schema::dropIfExists('gifts');
        Schema::table('orders', function (Blueprint $table) {
            $table->dropColumn(['is_gift', 'gift_recipient_name', 'gift_recipient_email', 'gift_message']);
        });
        Schema::table('order_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bundle_id');
        });
        Schema::dropIfExists('bundle_book');
        Schema::dropIfExists('bundles');
    }
};
