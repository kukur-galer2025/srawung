<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AssistantMessage;
use App\Models\Book;
use App\Services\Assistant\BookAssistant;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Kanca — asisten buku & panduan Srawung. Publik; pengguna yang login juga bisa
 * menanyakan pesanan/perpustakaannya sendiri. Jawaban bisa dialirkan (stream=true, SSE).
 */
class AssistantController extends Controller
{
    /** Batas pertanyaan per alamat IP per hari. */
    private const PER_IP_DAILY = 60;

    public function status()
    {
        return response()->json(['enabled' => BookAssistant::enabled()]);
    }

    public function chat(Request $request, BookAssistant $assistant)
    {
        if (!BookAssistant::enabled()) {
            return response()->json(['message' => 'Asisten belum diaktifkan.', 'code' => 'assistant_disabled'], 503);
        }

        $data = $request->validate([
            'messages' => 'required|array|min:1|max:30',
            'messages.*.role' => 'required|in:user,assistant',
            'messages.*.content' => 'required|string|max:4000',
            'stream' => 'sometimes|boolean',
            'session_id' => 'nullable|string|max:40',
            'book_slug' => 'nullable|string|max:150',
        ]);

        // Hanya 12 pesan terakhir yang dikirim ke model (hemat token, cukup untuk konteks obrolan).
        $history = array_values(array_slice($data['messages'], -12));
        while ($history && $history[0]['role'] !== 'user') {
            array_shift($history);
        }
        $last = end($history);
        if (!$last || $last['role'] !== 'user') {
            return response()->json(['message' => 'Pesan terakhir harus dari pengguna.'], 422);
        }
        if (mb_strlen($last['content']) > 600) {
            return response()->json(['message' => 'Pertanyaan terlalu panjang. Ringkas menjadi maksimal 600 karakter, ya.'], 422);
        }

        $ipKey = 'assistant-ip:' . $request->ip();
        if (RateLimiter::tooManyAttempts($ipKey, self::PER_IP_DAILY)) {
            return response()->json(['message' => 'Batas pertanyaan hari ini sudah tercapai. Silakan lanjut besok, atau hubungi admin via WhatsApp.'], 429);
        }

        $dayKey = 'assistant-daily:' . now()->toDateString();
        $limit = (int) config('services.assistant.daily_limit');
        if ($limit > 0 && (int) Cache::get($dayKey, 0) >= $limit) {
            return response()->json(['message' => 'Asisten sedang sangat ramai hari ini. Silakan hubungi admin via WhatsApp.'], 429);
        }

        RateLimiter::hit($ipKey, 86400);
        Cache::add($dayKey, 0, now()->endOfDay());
        Cache::increment($dayKey);

        $user = $request->user('sanctum');
        $pageBook = !empty($data['book_slug']) ? Book::where('slug', $data['book_slug'])->where('status', 'published')->first() : null;
        $session = $data['session_id'] ?? null;

        if ($request->boolean('stream')) {
            return $this->stream($assistant, $history, $user, $pageBook, $session);
        }

        try {
            $result = $assistant->reply($history, $user, $pageBook);
        } catch (\Throwable $e) {
            Log::error('Asisten Srawung gagal menjawab: ' . $e->getMessage());

            return response()->json(['message' => 'Asisten sedang sibuk. Coba lagi sebentar, atau hubungi admin via WhatsApp.'], 503);
        }

        $log = $this->record($result, $last['content'], $user, $pageBook, $session);

        return response()->json(['reply' => $result['reply'], 'books' => $result['books'], 'message_id' => $log?->id]);
    }

    /** Jawaban dialirkan sebagai Server-Sent Events: delta (teks), status, restart, done, error. */
    private function stream(BookAssistant $assistant, array $history, $user, ?Book $pageBook, ?string $session): StreamedResponse
    {
        $question = end($history)['content'];

        return response()->stream(function () use ($assistant, $history, $user, $pageBook, $session, $question) {
            @ini_set('zlib.output_compression', '0');
            $send = function (string $event, array $data) {
                echo "event: {$event}\ndata: " . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n\n";
                // Dorong isi buffer ke klien tanpa menutup buffernya (aman untuk server & pengujian).
                if (ob_get_level() > 0) {
                    @ob_flush();
                }
                @flush();
            };

            try {
                $result = $assistant->reply($history, $user, $pageBook, $send);
                $log = $this->record($result, $question, $user, $pageBook, $session);
                $send('done', ['reply' => $result['reply'], 'books' => $result['books'], 'message_id' => $log?->id]);
            } catch (\Throwable $e) {
                Log::error('Asisten Srawung gagal menjawab (stream): ' . $e->getMessage());
                $send('error', ['message' => 'Asisten sedang sibuk. Coba lagi sebentar, atau hubungi admin via WhatsApp.']);
            }
        }, 200, [
            'Content-Type' => 'text/event-stream; charset=UTF-8',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no', // Nginx: jangan tahan potongan teks
        ]);
    }

    /** Catat tanya-jawab untuk laporan mutu (gagal mencatat tidak boleh menggagalkan jawaban). */
    private function record(array $result, string $question, $user, ?Book $pageBook, ?string $session): ?AssistantMessage
    {
        Log::info('Asisten Srawung menjawab', $result['usage']);
        try {
            return AssistantMessage::create([
                'session_id' => $session,
                'user_id' => $user?->id,
                'page_book' => $pageBook?->slug,
                'question' => mb_substr($question, 0, 600),
                'answer' => mb_substr($result['reply'], 0, 4000),
                'provider' => $result['usage']['provider'] ?? null,
                'tools' => $result['tools'] ?: null,
                'missing' => $result['missing'] ?: null,
                'failed' => $result['failed'],
            ]);
        } catch (\Throwable $e) {
            report($e);

            return null;
        }
    }

    /** 👍/👎 untuk sebuah jawaban — hanya dari obrolan yang sama (session_id cocok). */
    public function feedback(Request $request)
    {
        $data = $request->validate([
            'message_id' => 'required|integer',
            'session_id' => 'required|string|max:40',
            'rating' => 'required|in:1,-1',
            'feedback' => 'nullable|string|max:200',
        ]);
        $updated = AssistantMessage::whereKey($data['message_id'])->where('session_id', $data['session_id'])
            ->update(['rating' => (int) $data['rating'], 'feedback' => $data['feedback'] ?? null]);

        return $updated
            ? response()->json(['message' => 'Terima kasih atas penilaiannya!'])
            : response()->json(['message' => 'Jawaban tidak ditemukan.'], 404);
    }
}
