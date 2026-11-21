<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class UserLibrary extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    use HasFactory;

    protected $table = 'user_library';

    protected $fillable = [
        'user_id',
        'book_id',
        'order_id',
        'access_status',
        'last_read_page',
        'last_read_at',
        'resume_reminded_at',
    ];

    protected function casts(): array
    {
        return [
            'last_read_at' => 'datetime',
            'resume_reminded_at' => 'datetime',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function book()
    {
        return $this->belongsTo(Book::class);
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
