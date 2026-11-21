<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Alamat halaman publik kreator: /penulis/{slug}. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('creator_profiles', function (Blueprint $table) {
            $table->string('slug', 120)->nullable()->unique()->after('display_name');
        });
    }

    public function down(): void
    {
        Schema::table('creator_profiles', fn (Blueprint $table) => $table->dropColumn('slug'));
    }
};
