<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('books', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('slug')->unique();
            $table->string('author');
            $table->text('synopsis');
            $table->bigInteger('price');
            $table->string('cover_path')->nullable();
            $table->foreignId('category_id')->nullable()->constrained()->onDelete('set null');
            $table->integer('total_pages')->default(0);
            $table->integer('preview_pages')->default(5);
            $table->string('source_file_path')->nullable();
            $table->enum('status', ['draft', 'published'])->default('draft');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('books');
    }
};
