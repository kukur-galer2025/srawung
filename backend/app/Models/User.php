<?php

namespace App\Models;

use Illuminate\Contracts\Auth\MustVerifyEmail;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable implements MustVerifyEmail
{
    use \App\Models\Concerns\NormalizesTimezone;

    use HasApiTokens, HasFactory, Notifiable;

    /**
     * Sengaja TANPA 'role' dan 'is_blocked': keduanya hanya boleh diubah lewat kode
     * yang disengaja (forceFill di AdminController/CreatorController), sehingga
     * kesalahan mass-assignment tidak bisa dipakai untuk menaikkan hak akses.
     */
    protected $fillable = [
        'name',
        'email',
        'google_id',
        'avatar',
        'whatsapp',
        'password',
        'preferred_categories',
        'reminder_emails',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected $appends = ['has_password'];

    public function getHasPasswordAttribute(): bool
    {
        return !empty($this->attributes['password'] ?? null);
    }

    public function readerFlags()
    {
        return $this->hasMany(ReaderFlag::class);
    }

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_blocked' => 'boolean',
            'preferred_categories' => 'array',
            'anonymized_at' => 'datetime',
            'reminder_emails' => 'boolean',
        ];
    }

    public function sendPasswordResetNotification($token): void
    {
        $this->notify(new \App\Notifications\ResetPasswordNotification($token));
    }

    public function sendEmailVerificationNotification(): void
    {
        $this->notify(new \App\Notifications\VerifyEmailNotification());
    }

    public function creatorProfile()
    {
        return $this->hasOne(CreatorProfile::class);
    }

    public function createdBooks()
    {
        return $this->hasMany(Book::class, 'creator_id');
    }

    public function isCreator(): bool
    {
        return $this->role === 'creator';
    }

    public function cart()
    {
        return $this->hasOne(Cart::class);
    }

    public function orders()
    {
        return $this->hasMany(Order::class);
    }

    public function userLibraries()
    {
        return $this->hasMany(UserLibrary::class);
    }

    public function readingSessions()
    {
        return $this->hasMany(ReadingSession::class);
    }

    public function accessLogs()
    {
        return $this->hasMany(AccessLog::class);
    }
}
