<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class AccessLog extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    use HasFactory;

    public $timestamps = false;

    protected $fillable = [
        'user_id',
        'book_id',
        'page_number',
        'ip_address',
        'created_at',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function book()
    {
        return $this->belongsTo(Book::class);
    }
}
