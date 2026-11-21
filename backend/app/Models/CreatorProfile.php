<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class CreatorProfile extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = ['user_id', 'display_name', 'slug', 'bio', 'commission_percent', 'payout_method', 'payout_provider', 'payout_account', 'payout_holder', 'terms_version', 'terms_accepted_at'];

    protected function casts(): array
    {
        return ['commission_percent' => 'integer', 'terms_accepted_at' => 'datetime'];
    }

    /** Sudah menyetujui versi Syarat & Ketentuan Kreator yang berlaku? */
    public function acceptedCurrentTerms(): bool
    {
        return $this->terms_version === \App\Services\CreatorTerms::VERSION;
    }

    /** Slug halaman publik ikut nama pena (unik). */
    protected static function booted(): void
    {
        static::saving(function (CreatorProfile $p) {
            if (!$p->slug || $p->isDirty('display_name')) {
                $base = Str::slug($p->display_name) ?: 'kreator';
                $slug = $base;
                $i = 2;
                while (static::where('slug', $slug)->when($p->exists, fn ($q) => $q->whereKeyNot($p->id))->exists()) {
                    $slug = "{$base}-{$i}";
                    $i++;
                }
                $p->slug = $slug;
            }
        });
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function hasPayoutAccount(): bool
    {
        return $this->payout_method && $this->payout_provider && $this->payout_account && $this->payout_holder;
    }
}
