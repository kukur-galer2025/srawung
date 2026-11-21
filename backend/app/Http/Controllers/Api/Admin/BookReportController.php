<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\BookReport;
use App\Models\User;
use App\Notifications\BookReportResolved;
use App\Notifications\BookTakenDown;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;

/** Antrean laporan konten untuk admin: tinjau, tolak, atau turunkan buku. */
class BookReportController extends Controller
{
    public function index(Request $request)
    {
        $status = $request->query('status', 'aktif');
        $query = BookReport::with(['book:id,title,slug,status,creator_id,author', 'book.creator:id,name', 'resolver:id,name'])->latest();
        if ($status === 'aktif') {
            $query->whereIn('status', ['baru', 'ditinjau']);
        } elseif (in_array($status, BookReport::STATUSES, true)) {
            $query->where('status', $status);
        }

        return response()->json([
            ...$query->paginate(20)->toArray(),
            'counts' => BookReport::selectRaw('status, COUNT(*) c')->groupBy('status')->pluck('c', 'status'),
            'types' => BookReport::TYPES,
            'relationships' => BookReport::RELATIONSHIPS,
        ]);
    }

    /**
     * action: review (tandai sedang ditinjau) | reject (laporan tidak terbukti) |
     *         takedown (laporan diterima → buku diturunkan menjadi draf).
     */
    public function update(Request $request, int $id)
    {
        $data = $request->validate([
            'action' => 'required|in:review,reject,takedown',
            'note' => 'required_unless:action,review|nullable|string|max:2000',
        ], ['note.required_unless' => 'Tulis catatan keputusan — dikirim ke pelapor (dan ke kreator bila buku diturunkan).']);

        $report = BookReport::with('book')->findOrFail($id);
        if (in_array($report->status, ['diterima', 'ditolak'], true)) {
            return response()->json(['message' => 'Laporan ini sudah diputuskan.'], 422);
        }

        if ($data['action'] === 'review') {
            $report->update(['status' => 'ditinjau']);

            return response()->json(['message' => 'Laporan ditandai sedang ditinjau.', 'report' => $report]);
        }

        $accepted = $data['action'] === 'takedown';
        DB::transaction(function () use ($report, $accepted, $data, $request) {
            $report->update([
                'status' => $accepted ? 'diterima' : 'ditolak',
                'admin_note' => $data['note'],
                'resolved_by' => $request->user()->id,
                'resolved_at' => now(),
            ]);
            if ($accepted && $report->book) {
                // Berhenti dijual; pembeli lama tetap bisa membaca kecuali admin memutuskan lain.
                $report->book->update(['status' => 'draft']);
                // Laporan lain yang masih terbuka untuk buku yang sama ikut selesai.
                BookReport::where('book_id', $report->book_id)->whereKeyNot($report->id)->whereIn('status', ['baru', 'ditinjau'])
                    ->update(['status' => 'diterima', 'admin_note' => $data['note'], 'resolved_by' => $request->user()->id, 'resolved_at' => now()]);
            }
        });

        try {
            Notification::route('mail', $report->reporter_email)->notify(new BookReportResolved($report->fresh('book')));
            if ($accepted && $report->book?->creator_id && ($creator = User::find($report->book->creator_id))) {
                $creator->notify(new BookTakenDown($report->book, $report->type, $data['note']));
            }
        } catch (\Throwable $e) {
            report($e);
        }

        return response()->json([
            'message' => $accepted ? 'Laporan diterima dan buku diturunkan (tidak lagi dijual).' : 'Laporan ditolak. Pelapor diberi tahu lewat email.',
            'report' => $report->fresh(['book', 'resolver']),
        ]);
    }
}
