<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class Post extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = [
        'title', 'slug', 'tag', 'excerpt', 'body', 'format', 'cover_path',
        'book_id', 'author_id', 'status', 'published_at',
    ];

    protected $appends = ['cover_url', 'cover_source', 'book_cover_url', 'reading_minutes'];

    protected function casts(): array
    {
        return [
            'published_at' => 'datetime',
            'views' => 'integer',
        ];
    }

    public function author()
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function book()
    {
        return $this->belongsTo(Book::class);
    }

    public function scopePublished($query)
    {
        return $query->where('status', 'published')
            ->whereNotNull('published_at')
            ->where('published_at', '<=', now());
    }

    /**
     * Isi artikel siap tampil.
     * - format "html" (editor visual): disanitasi ulang dengan daftar tag yang diizinkan.
     * - format "markdown": HTML mentah dibuang dan tautan berbahaya (javascript:) diblokir.
     */
    public function renderBody(): string
    {
        if ($this->format === 'html') {
            return \App\Services\HtmlSanitizer::clean($this->body ?? '');
        }

        return Str::markdown($this->body ?? '', [
            'html_input' => 'strip',
            'allow_unsafe_links' => false,
        ]);
    }

    public static function uniqueSlug(string $title, ?int $ignoreId = null): string
    {
        $base = Str::slug($title) ?: 'artikel';
        $slug = $base;
        $i = 2;
        while (static::where('slug', $slug)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists()) {
            $slug = "{$base}-{$i}";
            $i++;
        }

        return $slug;
    }

    /**
     * Foto sampul artikel:
     *  1. gambar sampul yang diunggah admin;
     *  2. bila kosong, gambar pertama di isi artikel (otomatis).
     * Bila keduanya tidak ada, frontend memakai sampul buku terkait (book_cover_url).
     */
    protected function coverUrl(): Attribute
    {
        return Attribute::make(get: fn () => $this->cover_path
            ? Storage::disk('public')->url($this->cover_path)
            : $this->firstBodyImage());
    }

    /** 'upload' | 'body' | 'book' | null — untuk penanda di admin. */
    protected function coverSource(): Attribute
    {
        return Attribute::make(get: fn () => match (true) {
            (bool) $this->cover_path => 'upload',
            (bool) $this->firstBodyImage() => 'body',
            (bool) $this->book_cover_url => 'book',
            default => null,
        });
    }

    protected function bookCoverUrl(): Attribute
    {
        return Attribute::make(get: fn () => $this->book_id && $this->relationLoaded('book') ? $this->book?->cover_url : null);
    }

    private function firstBodyImage(): ?string
    {
        $body = (string) ($this->attributes['body'] ?? '');
        if ($body === '') {
            return null;
        }
        if (preg_match('/<img[^>]+src=["\']([^"\']+)["\']/i', $body, $m) || preg_match('/!\[[^\]]*\]\(([^)\s]+)/', $body, $m)) {
            $src = html_entity_decode($m[1]);

            return preg_match('#^(https?:)?//|^/#i', $src) ? $src : null;
        }

        return null;
    }

    protected function readingMinutes(): Attribute
    {
        return Attribute::make(get: fn () => max(1, (int) ceil(str_word_count(strip_tags($this->body ?? '')) / 200)));
    }
}
