<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class PaymentProof extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    use HasFactory;

    protected $fillable = [
        'order_id',
        'file_path',
        'buyer_note',
        'status',
        'rejection_reason',
    ];

    /** Sidik jari internal (hash) tidak perlu dikirim ke klien. */
    protected $hidden = ['file_hash', 'phash'];

    protected function casts(): array
    {
        return ['risk_flags' => 'array', 'similarity' => 'integer'];
    }

    public function order()
    {
        return $this->belongsTo(Order::class);
    }
}
