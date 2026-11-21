<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class CreatorPayout extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = [
        'creator_id', 'amount', 'fee', 'net_amount', 'terms_version', 'status', 'payout_method', 'payout_provider', 'payout_account', 'payout_holder',
        'reference', 'proof_path', 'note', 'processed_by', 'processed_at',
    ];

    protected $hidden = ['proof_path'];

    protected $appends = ['has_proof'];

    protected function casts(): array
    {
        return ['amount' => 'integer', 'fee' => 'integer', 'net_amount' => 'integer', 'processed_at' => 'datetime'];
    }

    public function getHasProofAttribute(): bool
    {
        return (bool) $this->proof_path;
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'creator_id');
    }

    public function proofExists(): bool
    {
        return $this->proof_path && Storage::disk('local')->exists($this->proof_path);
    }
}
