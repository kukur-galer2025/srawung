<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Satu tanya-jawab Kanca (untuk penilaian & laporan mutu). */
class AssistantMessage extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = ['session_id', 'user_id', 'page_book', 'question', 'answer', 'provider', 'tools', 'missing', 'failed', 'rating', 'feedback'];

    protected $hidden = ['session_id'];

    protected function casts(): array
    {
        return ['tools' => 'array', 'missing' => 'array', 'failed' => 'boolean', 'rating' => 'integer'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
