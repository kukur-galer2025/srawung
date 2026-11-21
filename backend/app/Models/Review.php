<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Review extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = ['book_id', 'user_id', 'rating', 'title', 'body', 'is_hidden', 'hidden_reason'];

    protected function casts(): array
    {
        return ['rating' => 'integer', 'is_hidden' => 'boolean'];
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
