<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class OrderItem extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    use HasFactory;

    protected $fillable = [
        'order_id',
        'book_id',
        'bundle_id',
        'price',
        'discount',
    ];

    public function order()
    {
        return $this->belongsTo(Order::class);
    }

    public function bundle()
    {
        return $this->belongsTo(Bundle::class);
    }

    public function book()
    {
        return $this->belongsTo(Book::class);
    }
}
