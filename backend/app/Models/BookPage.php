<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class BookPage extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    /** Teks halaman hanya dipakai untuk pencarian di dalam buku — jangan pernah ikut ke respons API. */
    protected $hidden = ['text', 'token_count'];

    use HasFactory;

    protected $fillable = [
        'book_id',
        'page_number',
        'image_path',
    ];

    public function book()
    {
        return $this->belongsTo(Book::class);
    }
}
