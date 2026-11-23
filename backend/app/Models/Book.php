<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

class Book extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    use HasFactory;

    protected $fillable = [
        'title',
        'slug',
        'author',
        'synopsis',
        'price',
        'sale_price',
        'sale_ends_at',
        'cover_path',
        'category_id',
        'next_book_id',
        'creator_id',
        'total_pages',
        'preview_pages',
        'source_file_path',
        'processing_status',
        'processing_error',
        'processing_pages_done',
        'processing_pages_total',
        'processing_started_at',
        'processing_finished_at',
        'status',
        'rating_avg',
        'rating_count',
    ];

    /** Daftar isi hanya untuk pembaca yang memiliki buku (lihat ReaderController). */
    protected $hidden = ['toc', 'cover_meta', 'source_file_path', 'processing_error'];

    /** Detail internal file hanya untuk pengelola (admin & kreator pemilik buku). */
    public const MANAGER_FIELDS = ['source_file_path', 'processing_error'];

    protected $appends = [
        'formatted_price',
        'cover_url',
        'cover_srcset',
        'cover_placeholder',
        'effective_price',
        'is_on_sale',
        'discount_percent',
    ];

    protected static function booted(): void
    {
        static::saving(fn (Book $book) => $book->syncCoverMeta());
    }

    /** Sampul berubah → buat ulang varian & placeholder (dan hapus varian sampul lama). */
    public function syncCoverMeta(bool $force = false): void
    {
        if (!$force && !$this->isDirty('cover_path')) {
            return;
        }
        if ($this->isDirty('cover_path') && ($old = $this->getOriginal('cover_path')) && $old !== $this->cover_path) {
            \App\Services\CoverImage::deleteVariants($old);
        }
        $this->cover_meta = $this->cover_path ? \App\Services\CoverImage::buildVariants($this->cover_path) : null;
    }

    protected function casts(): array
    {
        return [
            'cover_meta' => 'array',
            'sale_ends_at' => 'datetime',
            'processing_started_at' => 'datetime',
            'processing_finished_at' => 'datetime',
            'processing_pages_done' => 'integer',
            'processing_pages_total' => 'integer',
            'toc' => 'array',
            'rating_avg' => 'float',
            'rating_count' => 'integer',
        ];
    }

    /** Kreator pemilik buku (null = buku milik Srawung). */
    public function creator()
    {
        return $this->belongsTo(User::class, 'creator_id');
    }

    /** Buku lanjutan pilihan admin (seri). */
    public function nextBook()
    {
        return $this->belongsTo(Book::class, 'next_book_id');
    }

    public function bundles()
    {
        return $this->belongsToMany(Bundle::class, 'bundle_book');
    }

    /** Promo aktif: harga promo diisi, lebih murah dari harga normal, dan belum berakhir. */
    public function saleActive(): bool
    {
        return $this->sale_price !== null
            && (int) $this->sale_price < (int) $this->price
            && ($this->sale_ends_at === null || $this->sale_ends_at->isFuture());
    }

    /** Harga yang benar-benar dibayar pembeli saat ini. */
    public function currentPrice(): int
    {
        return $this->saleActive() ? (int) $this->sale_price : (int) $this->price;
    }

    /**
     * Ekspresi SQL harga efektif — untuk filter/urut harga di query.
     *
     * @return array{0: string, 1: array<int, string>}
     */
    public static function effectivePriceSql(string $table = 'books'): array
    {
        return [
            "CASE WHEN {$table}.sale_price IS NOT NULL AND {$table}.sale_price < {$table}.price"
            . " AND ({$table}.sale_ends_at IS NULL OR {$table}.sale_ends_at > ?) THEN {$table}.sale_price ELSE {$table}.price END",
            [now()->toDateTimeString()],
        ];
    }

    public function scopeOnSale($query)
    {
        return $query->whereNotNull('sale_price')
            ->whereColumn('sale_price', '<', 'price')
            ->where(fn ($q) => $q->whereNull('sale_ends_at')->orWhere('sale_ends_at', '>', now()));
    }

    public function category()
    {
        return $this->belongsTo(Category::class);
    }

    public function pages()
    {
        return $this->hasMany(BookPage::class);
    }

    public function orderItems()
    {
        return $this->hasMany(OrderItem::class);
    }

    public function reviews()
    {
        return $this->hasMany(Review::class);
    }

    /** Hitung ulang rata-rata rating dari ulasan yang tampil. */
    public function refreshRating(): void
    {
        $row = $this->reviews()->where('is_hidden', false)->selectRaw('COUNT(*) as n, AVG(rating) as avg')->first();
        $this->forceFill([
            'rating_count' => (int) ($row->n ?? 0),
            'rating_avg' => round((float) ($row->avg ?? 0), 2),
        ])->saveQuietly();
    }

    public function userLibraries()
    {
        return $this->hasMany(UserLibrary::class);
    }

    protected function formattedPrice(): Attribute
    {
        return Attribute::make(
            get: fn () => 'Rp ' . number_format($this->currentPrice(), 0, ',', '.')
        );
    }

    protected function effectivePrice(): Attribute
    {
        return Attribute::make(get: fn () => $this->currentPrice());
    }

    protected function isOnSale(): Attribute
    {
        return Attribute::make(get: fn () => $this->saleActive());
    }

    protected function discountPercent(): Attribute
    {
        return Attribute::make(
            get: fn () => $this->saleActive() && $this->price > 0
                ? (int) round((1 - $this->sale_price / $this->price) * 100)
                : 0
        );
    }

    /**
     * srcset varian WebP kecil, mis. ".../cover_x-160.webp 160w, .../cover_x-320.webp 320w, ...".
     * Browser memilih ukuran yang pas sehingga kartu katalog tidak mengunduh sampul ukuran penuh.
     */
    protected function coverSrcset(): Attribute
    {
        return Attribute::make(get: function () {
            $widths = $this->cover_meta['w'] ?? [];
            if (!$this->cover_path || !$widths || filter_var($this->cover_path, FILTER_VALIDATE_URL)) {
                return null;
            }
            $base = preg_replace('/\.[^.\/]+$/', '', $this->cover_path);
            $disk = Storage::disk('public');

            return implode(', ', array_map(fn ($w) => $disk->url("{$base}-{$w}.webp") . " {$w}w", $widths));
        });
    }

    /** Placeholder buram mini (data URI) — tampil seketika bersama HTML sebelum sampul selesai dimuat. */
    protected function coverPlaceholder(): Attribute
    {
        return Attribute::make(get: fn () => $this->cover_meta['ph'] ?? null);
    }

    protected function coverUrl(): Attribute
    {
        return Attribute::make(
            get: function () {
                if (!$this->cover_path) {
                    return null;
                }
                if (filter_var($this->cover_path, FILTER_VALIDATE_URL)) {
                    return $this->cover_path;
                }
                return Storage::disk('public')->url($this->cover_path);
            }
        );
    }
}
