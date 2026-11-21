<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Laporan pelanggaran hak cipta / konten terlarang untuk sebuah buku. */
class BookReport extends Model
{
    use \App\Models\Concerns\NormalizesTimezone;

    public const TYPES = [
        'hak_cipta' => 'Pelanggaran hak cipta',
        'konten_terlarang' => 'Konten terlarang / melanggar hukum',
        'lainnya' => 'Lainnya',
    ];

    public const RELATIONSHIPS = [
        'pemilik' => 'Pemilik hak cipta',
        'kuasa' => 'Kuasa / perwakilan pemilik hak',
        'pembaca' => 'Pembaca / pihak lain',
    ];

    public const STATUSES = ['baru', 'ditinjau', 'diterima', 'ditolak'];

    protected $fillable = [
        'book_id', 'user_id', 'reporter_name', 'reporter_email', 'type', 'relationship', 'description', 'evidence_url',
        'status', 'admin_note', 'resolved_by', 'resolved_at', 'ip',
    ];

    protected $hidden = ['ip'];

    protected function casts(): array
    {
        return ['resolved_at' => 'datetime'];
    }

    public function book()
    {
        return $this->belongsTo(Book::class);
    }

    public function resolver()
    {
        return $this->belongsTo(User::class, 'resolved_by');
    }
}
