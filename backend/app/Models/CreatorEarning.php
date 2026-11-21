<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorEarning extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = ['creator_id', 'order_id', 'order_item_id', 'book_id', 'gross', 'commission_percent', 'commission', 'net', 'reversed_at', 'reversal_reason'];

    protected function casts(): array
    {
        return ['gross' => 'integer', 'commission' => 'integer', 'net' => 'integer', 'commission_percent' => 'integer', 'reversed_at' => 'datetime'];
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
