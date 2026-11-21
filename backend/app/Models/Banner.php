<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Banner extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    public const THEMES = ['blue', 'navy', 'amber', 'emerald', 'rose', 'violet'];

    protected $fillable = [
        'eyebrow', 'title', 'subtitle', 'cta_label', 'link_url', 'image_path',
        'theme', 'sort_order', 'is_active', 'starts_at', 'ends_at',
    ];

    protected $appends = ['image_url'];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sort_order' => 'integer',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    /** Banner yang sedang tayang: aktif dan berada di dalam jadwal tayang. */
    public function scopeLive($query)
    {
        $now = now();

        return $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $now))
            ->orderBy('sort_order')
            ->orderByDesc('id');
    }

    protected function imageUrl(): Attribute
    {
        return Attribute::make(get: fn () => $this->image_path ? Storage::disk('public')->url($this->image_path) : null);
    }
}
