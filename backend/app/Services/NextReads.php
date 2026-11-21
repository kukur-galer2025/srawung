<?php

namespace App\Services;

use App\Models\Book;
use App\Models\User;
use App\Models\UserLibrary;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * "Setelah buku ini, pembaca biasanya lanjut ke…" — rantai Markov orde-1 atas urutan
 * buku yang dimiliki tiap pembaca.
 *
 *  - Urutan per pembaca diambil dari kapan buku masuk ke perpustakaannya.
 *  - Transisi A→B: buku berikutnya bernilai 1, dua langkah sesudahnya 0,5 (peluruhan).
 *    Bobot ×1,5 bila A sudah dibaca ≥ 50% sebelum pindah — tanda pembaca benar-benar
 *    "lanjut", bukan sekadar membeli sekaligus.
 *  - P(B | A) = bobot(A→B) / bobot(A→semua). Persentase hanya ditampilkan bila sudah
 *    ada cukup pembaca (≥ 5 transisi dari A) agar tidak menyesatkan.
 *
 * Urutan hasil:
 *  1. Buku lanjutan pilihan admin (seri resmi, mis. PHP → Laravel)
 *  2. Transisi pembaca nyata (minimal 2 pembaca)
 *  3. Cadangan: buku dengan topik paling mirip (Recommender::similar)
 */
class NextReads
{
    public const MIN_READERS = 2;
    public const MIN_FOR_PERCENT = 5;

    public function __construct(private readonly Recommender $recommender) {}

    /** @return array{weights: array<int, array<int, float>>, readers: array<int, array<int, int>>, totals: array<int, float>, from: array<int, int>} */
    public function transitions(): array
    {
        return Cache::remember('next:t:' . $this->version(), now()->addMinutes(30), function () {
            $rows = DB::table('user_library as l')
                ->join('books as b', 'b.id', '=', 'l.book_id')
                ->where('l.access_status', 'active')
                ->orderBy('l.user_id')->orderBy('l.created_at')->orderBy('l.id')
                ->get(['l.user_id', 'l.book_id', 'l.last_read_page', 'b.total_pages']);

            $seqs = [];
            foreach ($rows as $r) {
                $progress = $r->total_pages ? min(1, (int) $r->last_read_page / max(1, (int) $r->total_pages)) : 0;
                $seqs[$r->user_id][] = ['id' => (int) $r->book_id, 'read' => $progress >= 0.5];
            }

            $weights = [];   // A → B → bobot
            $readers = [];   // A → B → jumlah pembaca berbeda
            $totals = [];    // A → total bobot keluar
            $from = [];      // A → jumlah pembaca yang punya buku sesudah A
            foreach ($seqs as $seq) {
                $n = count($seq);
                for ($i = 0; $i < $n - 1; $i++) {
                    $a = $seq[$i]['id'];
                    $from[$a] = ($from[$a] ?? 0) + 1;
                    $seen = [];
                    foreach ([1 => 1.0, 2 => 0.5] as $step => $decay) {
                        if (!isset($seq[$i + $step])) {
                            break;
                        }
                        $b = $seq[$i + $step]['id'];
                        if ($b === $a || isset($seen[$b])) {
                            continue;
                        }
                        $seen[$b] = true;
                        $w = $decay * ($seq[$i]['read'] ? 1.5 : 1.0);
                        $weights[$a][$b] = ($weights[$a][$b] ?? 0) + $w;
                        $readers[$a][$b] = ($readers[$a][$b] ?? 0) + 1;
                        $totals[$a] = ($totals[$a] ?? 0) + $w;
                    }
                }
            }

            return compact('weights', 'readers', 'totals', 'from');
        });
    }

    /**
     * @return list<array{book: Book, kind: string, reason: string, percent: ?int, owned: bool}>
     */
    public function for(Book $book, ?User $user = null, int $limit = 3): array
    {
        $picked = [];

        // 1) Seri resmi pilihan admin.
        if ($book->next_book_id) {
            $picked[$book->next_book_id] = ['kind' => 'series', 'reason' => 'Lanjutan seri ini', 'percent' => null];
        }

        // 2) Transisi pembaca nyata.
        $t = $this->transitions();
        $out = $t['weights'][$book->id] ?? [];
        arsort($out);
        foreach ($out as $b => $w) {
            if (count($picked) >= $limit) {
                break;
            }
            if (isset($picked[$b]) || ($t['readers'][$book->id][$b] ?? 0) < self::MIN_READERS) {
                if (isset($picked[$b]) && $picked[$b]['kind'] === 'series') {
                    $picked[$b]['percent'] = $this->percent($t, $book->id, $b);
                }
                continue;
            }
            $percent = $this->percent($t, $book->id, $b);
            $picked[$b] = [
                'kind' => 'readers',
                'reason' => $percent ? "{$percent}% pembaca lanjut ke buku ini" : 'Pembaca buku ini lanjut ke sini',
                'percent' => $percent,
            ];
        }

        // 3) Cadangan: topik paling mirip.
        if (count($picked) < $limit) {
            foreach ($this->recommender->similar($book, $limit + 3) as $item) {
                $id = $item['book']->id;
                if ($id === $book->id || isset($picked[$id])) {
                    continue;
                }
                $picked[$id] = ['kind' => 'similar', 'reason' => 'Topik yang melengkapi', 'percent' => null];
                if (count($picked) >= $limit) {
                    break;
                }
            }
        }
        unset($picked[$book->id]);

        $books = Book::whereIn('id', array_keys($picked))->where('status', 'published')->get()->keyBy('id');
        $owned = $user
            ? UserLibrary::where('user_id', $user->id)->whereIn('book_id', array_keys($picked))->where('access_status', 'active')->pluck('book_id')->flip()->all()
            : [];

        $result = [];
        foreach ($picked as $id => $info) {
            if (!isset($books[$id])) {
                continue;
            }
            $result[] = ['book' => $books[$id], ...$info, 'owned' => isset($owned[$id])];
        }

        return array_slice($result, 0, $limit);
    }

    private function percent(array $t, int $a, int $b): ?int
    {
        if (($t['from'][$a] ?? 0) < self::MIN_FOR_PERCENT || empty($t['totals'][$a])) {
            return null;
        }

        return (int) round(100 * ($t['readers'][$a][$b] ?? 0) / $t['from'][$a]);
    }

    private function version(): string
    {
        $row = DB::table('user_library')->selectRaw('COUNT(*) as c, MAX(updated_at) as u')->first();

        return md5(($row->c ?? 0) . '|' . ($row->u ?? ''));
    }
}
