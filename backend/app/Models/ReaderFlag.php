<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Catatan aktivitas baca yang mencurigakan (mis. mengambil halaman terlalu cepat). */
class ReaderFlag extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'book_id', 'reason', 'details'];

    protected function casts(): array
    {
        return ['details' => 'array'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function book()
    {
        return $this->belongsTo(Book::class);
    }
}
