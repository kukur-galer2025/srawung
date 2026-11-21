<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NewsletterCampaign extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = ['subject', 'preheader', 'body', 'status', 'recipients_count', 'sent_at', 'created_by'];

    protected function casts(): array
    {
        return ['sent_at' => 'datetime', 'recipients_count' => 'integer'];
    }

    public function author()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
