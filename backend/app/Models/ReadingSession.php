<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class ReadingSession extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    use HasFactory;

    protected $fillable = [
        'user_id',
        'book_id',
        'session_token',
        'started_at',
        'ip_address',
        'device',
        'is_active',
        'last_seen_at',
        'ended_reason',
    ];

    protected function casts(): array
    {
        return [
            'last_seen_at' => 'datetime',
            'started_at' => 'datetime',
            'is_active' => 'boolean',
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
}
