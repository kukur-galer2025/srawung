<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Bookmark extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = ['user_id', 'book_id', 'page_number', 'label'];

    protected $hidden = ['user_id'];

    protected function casts(): array
    {
        return ['page_number' => 'integer'];
    }
}
