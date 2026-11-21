<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * Paket bundel: beberapa buku dengan satu harga hemat.
 * Saat checkout paket dipecah menjadi baris buku (order_items.bundle_id), jadi
 * akses perpustakaan, invoice, dan laporan tetap bekerja per buku.
 */
class Bundle extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    protected $fillable = ['title', 'slug', 'description', 'price', 'is_active', 'starts_at', 'ends_at', 'sort'];

    protected function casts(): array
    {
        return [
            'price' => 'integer',
            'is_active' => 'boolean',
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    public function books()
    {
        return $this->belongsToMany(Book::class, 'bundle_book')->withPivot('sort')->orderBy('bundle_book.sort');
    }

    public function scopeAvailable($query)
    {
        return $query->where('is_active', true)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', now()));
    }

    public function isAvailable(): bool
    {
        return $this->is_active
            && ($this->starts_at === null || $this->starts_at->lte(now()))
            && ($this->ends_at === null || $this->ends_at->isFuture());
    }

    /**
     * Bagi harga paket ke tiap buku, sebanding dengan harga normalnya.
     * Jumlah bagian selalu tepat sama dengan harga paket (sisa pembulatan ke buku terakhir).
     *
     * @param  Collection<int, Book>  $books
     * @return array<int, int> book_id => bagian harga
     */
    public function allocate(Collection $books): array
    {
        $books = $books->values();
        $weight = max(1, (int) $books->sum(fn (Book $b) => max(1, (int) $b->price)));
        $shares = [];
        $allocated = 0;
        foreach ($books as $i => $book) {
            $share = $i === $books->count() - 1
                ? $this->price - $allocated
                : (int) floor($this->price * max(1, (int) $book->price) / $weight);
            $shares[$book->id] = $share;
            $allocated += $share;
        }

        return $shares;
    }

    /** Ringkasan untuk etalase: harga satuan saat ini vs harga paket. */
    public function toStorefront(): array
    {
        $books = $this->books->where('status', 'published')->values();
        $individual = (int) $books->sum(fn (Book $b) => $b->currentPrice());

        return [
            'id' => $this->id,
            'title' => $this->title,
            'slug' => $this->slug,
            'description' => $this->description,
            'price' => $this->price,
            'individual_total' => $individual,
            'savings' => max(0, $individual - $this->price),
            'savings_percent' => $individual > 0 ? (int) round(max(0, $individual - $this->price) / $individual * 100) : 0,
            'ends_at' => $this->ends_at?->toIso8601String(),
            'book_count' => $books->count(),
            'books' => $books->map(fn (Book $b) => [
                'id' => $b->id,
                'title' => $b->title,
                'slug' => $b->slug,
                'author' => $b->author,
                'cover_url' => $b->cover_url,
                'price' => (int) $b->price,
                'effective_price' => $b->currentPrice(),
            ])->all(),
        ];
    }
}
