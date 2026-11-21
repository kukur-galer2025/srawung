<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Wishlist extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    public const UPDATED_AT = null;

    protected $fillable = ['user_id', 'book_id', 'notified_sale_key', 'notified_at'];

    protected function casts(): array
    {
        return ['notified_at' => 'datetime'];
    }

    public function book()
    {
        return $this->belongsTo(Book::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
