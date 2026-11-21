<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AssistantMessage;
use App\Services\BookSearch;
use Illuminate\Http\Request;

/** Laporan mutu Kanca: kepuasan, topik yang sering ditanyakan, jawaban gagal/dinilai buruk, buku yang dicari tapi tidak ada. */
class AssistantReportController extends Controller
{
    /** Kata yang tidak membawa topik (di luar kata umum tokenizer). */
    private const NOISE = [
        'buku', 'bukunya', 'ada', 'apa', 'saya', 'mau', 'ingin', 'tolong', 'dong', 'kak', 'min', 'gimana', 'bagaimana', 'cara', 'yang',
        'rekomendasi', 'rekomendasikan', 'bisa', 'tidak', 'sudah', 'belum', 'kok', 'ya', 'nya', 'halo', 'hai', 'terima', 'kasih', 'amania', 'robonia', 'srawung', 'kanca',
    ];

    public function index(Request $request, BookSearch $tokenizer)
    {
        $days = in_array((int) $request->query('days'), [7, 30, 90], true) ? (int) $request->query('days') : 30;
        $base = AssistantMessage::where('created_at', '>=', now()->subDays($days - 1)->startOfDay());

        $total = (clone $base)->count();
        $up = (clone $base)->where('rating', 1)->count();
        $down = (clone $base)->where('rating', -1)->count();
        $failed = (clone $base)->where('failed', true)->count();

        // Topik: frekuensi kata bermakna di pertanyaan (tiap pertanyaan dihitung sekali per kata).
        $topics = [];
        foreach ((clone $base)->latest()->limit(3000)->pluck('question') as $q) {
            foreach (array_unique($tokenizer->tokenize($q)) as $w) {
                if (strlen($w) >= 3 && !in_array($w, self::NOISE, true) && !ctype_digit($w)) {
                    $topics[$w] = ($topics[$w] ?? 0) + 1;
                }
            }
        }
        arsort($topics);

        $missing = [];
        foreach ((clone $base)->whereNotNull('missing')->pluck('missing') as $list) {
            foreach ((array) $list as $m) {
                $missing[$m] = ($missing[$m] ?? 0) + 1;
            }
        }
        arsort($missing);

        $row = fn (AssistantMessage $m) => [
            'id' => $m->id,
            'question' => $m->question,
            'answer' => $m->answer,
            'rating' => $m->rating,
            'feedback' => $m->feedback,
            'failed' => $m->failed,
            'page_book' => $m->page_book,
            'tools' => $m->tools ?? [],
            'user' => $m->user?->only(['id', 'name']),
            'created_at' => $m->created_at,
        ];

        return response()->json([
            'days' => $days,
            'total' => $total,
            'sessions' => (clone $base)->whereNotNull('session_id')->distinct()->count('session_id'),
            'logged_in_share' => $total ? round((clone $base)->whereNotNull('user_id')->count() / $total * 100) : 0,
            'rated' => $up + $down,
            'satisfaction' => $up + $down ? round($up / ($up + $down) * 100) : null,
            'failed_rate' => $total ? round($failed / $total * 100) : 0,
            'topics' => collect($topics)->take(15)->map(fn ($c, $w) => ['word' => $w, 'count' => $c])->values(),
            'missing' => collect($missing)->take(15)->map(fn ($c, $q) => ['query' => $q, 'count' => $c])->values(),
            'tools' => (clone $base)->whereNotNull('tools')->pluck('tools')->flatten()->countBy()->sortDesc()->all(),
            'disliked' => (clone $base)->with('user:id,name')->where('rating', -1)->latest()->limit(20)->get()->map($row),
            'failures' => (clone $base)->with('user:id,name')->where('failed', true)->latest()->limit(20)->get()->map($row),
        ]);
    }
}
