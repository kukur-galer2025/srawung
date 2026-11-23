<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\BookReport;
use App\Notifications\BookReportReceived;
use App\Notifications\NewBookReport;
use App\Services\OrderLifecycle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Notification;
use Illuminate\Validation\Rule;

/** Formulir publik "Laporkan buku ini" (hak cipta / konten terlarang). */
class BookReportController extends Controller
{
    public function store(Request $request, string $slug)
    {
        $book = Book::where('slug', $slug)->where('status', 'published')->firstOrFail();
        $user = $request->user('sanctum');

        $data = $request->validate([
            'reporter_name' => ['required', 'string', new \App\Rules\SafeName],
            'reporter_email' => 'required|string|email|max:190',
            'type' => ['required', Rule::in(array_keys(BookReport::TYPES))],
            'relationship' => ['required', Rule::in(array_keys(BookReport::RELATIONSHIPS))],
            'description' => 'required|string|min:30|max:5000',
            'evidence_url' => 'nullable|string|url:http,https|max:500',
            'statement' => 'accepted',
        ], [
            'description.min' => 'Jelaskan pelanggarannya minimal 30 karakter (bagian mana, dan bukti kepemilikan bila ada).',
            'statement.accepted' => 'Centang pernyataan bahwa laporan dibuat dengan itikad baik dan informasinya benar.',
        ]);

        // Satu pelapor tidak perlu mengirim laporan yang sama berulang kali.
        $dup = BookReport::where('book_id', $book->id)->where('reporter_email', strtolower($data['reporter_email']))
            ->whereIn('status', ['baru', 'ditinjau'])->exists();
        if ($dup) {
            return response()->json(['message' => 'Laporan Anda untuk buku ini sudah kami terima dan sedang ditinjau.'], 422);
        }

        $report = BookReport::create([
            ...collect($data)->except('statement')->all(),
            'reporter_email' => strtolower($data['reporter_email']),
            'book_id' => $book->id,
            'user_id' => $user?->id,
            'status' => 'baru',
            'ip' => $request->ip(),
        ]);

        OrderLifecycle::notifyAdmin(new NewBookReport($report));
        // Formulir ini terbuka untuk umum: satu alamat maksimal 2 tanda terima per hari, agar tidak dipakai membanjiri email orang.
        \Illuminate\Support\Facades\RateLimiter::attempt('report-mail:' . hash('sha256', $report->reporter_email), 2, function () use ($report) {
            try {
                Notification::route('mail', $report->reporter_email)->notify(new BookReportReceived($report));
            } catch (\Throwable $e) {
                report($e);
            }
        }, 86400);

        return response()->json(['message' => 'Laporan terkirim. Tim kami akan meninjaunya maksimal 3 hari kerja dan mengabari Anda lewat email.'], 201);
    }
}
