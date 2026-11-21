<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ReaderNote extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    public const COLORS = ['amber', 'blue', 'emerald', 'rose', 'violet'];

    protected $fillable = ['user_id', 'book_id', 'page_number', 'body', 'color'];

    protected $hidden = ['user_id'];

    protected function casts(): array
    {
        return ['page_number' => 'integer'];
    }
}
