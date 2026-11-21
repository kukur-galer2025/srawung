<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Salinan keranjang di server (keranjang utama tetap di peramban). Dipakai untuk
 * pengingat keranjang yang ditinggalkan dan agar keranjang ikut pindah perangkat.
 */
class Cart extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = ['user_id', 'book_ids', 'bundle_ids', 'content_updated_at', 'reminder_count', 'reminded_at'];

    protected function casts(): array
    {
        return [
            'book_ids' => 'array',
            'bundle_ids' => 'array',
            'content_updated_at' => 'datetime',
            'reminded_at' => 'datetime',
            'reminder_count' => 'integer',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function isEmpty(): bool
    {
        return empty($this->book_ids) && empty($this->bundle_ids);
    }
}
