<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class NewsletterSubscriber extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    public const PENDING = 'pending';
    public const SUBSCRIBED = 'subscribed';
    public const UNSUBSCRIBED = 'unsubscribed';

    protected $fillable = ['email', 'user_id', 'token', 'status', 'source', 'confirmed_at', 'unsubscribed_at'];

    protected $hidden = ['token'];

    protected function casts(): array
    {
        return ['confirmed_at' => 'datetime', 'unsubscribed_at' => 'datetime'];
    }

    public static function newToken(): string
    {
        return Str::random(48);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function unsubscribeUrl(): string
    {
        return config('app.frontend_url') . '/newsletter/berhenti?token=' . $this->token;
    }

    /** Endpoint one-click (RFC 8058) untuk header List-Unsubscribe. */
    public function oneClickUrl(): string
    {
        return rtrim(config('app.url'), '/') . '/api/newsletter/unsubscribe/' . $this->token;
    }
}
