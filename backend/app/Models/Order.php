<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Order extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    use HasFactory;

    protected $fillable = [
        'order_number',
        'user_id',
        'total',
        'coupon_id',
        'status',
        'refunded_at',
        'refunded_by',
        'refund_reason',
        'refund_reference',
        'payment_deadline',
        'reminder_sent_at',
        'confirmed_at',
        'confirmed_by',
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'referrer',
        'landing_page',
    ];

    protected function casts(): array
    {
        return [
            'payment_deadline' => 'datetime',
            'reminder_sent_at' => 'datetime',
            'confirmed_at' => 'datetime',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function orderItems()
    {
        return $this->hasMany(OrderItem::class);
    }

    public function paymentProofs()
    {
        return $this->hasMany(PaymentProof::class);
    }

    public function latestProof()
    {
        return $this->hasOne(PaymentProof::class)->latestOfMany();
    }

    public function statusLogs()
    {
        return $this->hasMany(OrderStatusLog::class);
    }


    public function coupon()
    {
        return $this->belongsTo(Coupon::class);
    }

    public function confirmedByUser()
    {
        return $this->belongsTo(User::class, 'confirmed_by');
    }

    public function refundedByUser()
    {
        return $this->belongsTo(User::class, 'refunded_by');
    }
}
