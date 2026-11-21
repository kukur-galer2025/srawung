<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Coupon extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    use HasFactory;

    protected $fillable = [
        'creator_id',
        'restrict_books',
        'code',
        'type',
        'value',
        'quota',
        'used_count',
        'expires_at',
        'is_public',
        'description',
    ];

    protected function casts(): array
    {
        return [
            'expires_at' => 'datetime',
            'is_public' => 'boolean',
            'restrict_books' => 'boolean',
        ];
    }

    /** Pemilik voucher kreator (null = kupon Srawung untuk semua buku). */
    public function creator()
    {
        return $this->belongsTo(User::class, 'creator_id');
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    /** Buku yang boleh didiskon bila `restrict_books` aktif (voucher kreator). */
    public function books()
    {
        return $this->belongsToMany(Book::class, 'coupon_book');
    }
}
