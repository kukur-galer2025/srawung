<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\CreatorPayout;
use App\Models\User;
use App\Notifications\PayoutProcessed;
use App\Services\CreatorLedger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class CreatorController extends Controller
{
    /** Daftar kreator + saldo masing-masing. */
    public function index()
    {
        $creators = User::with('creatorProfile')->withCount('createdBooks')->where('role', 'creator')->orderBy('name')->get();

        return response()->json([
            'default_commission' => CreatorLedger::defaultCommission(),
            'min_payout' => CreatorLedger::minPayout(),
            'payout_fee' => CreatorLedger::payoutFee(),
            'creators' => $creators->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'is_blocked' => $u->is_blocked,
                'display_name' => $u->creatorProfile?->display_name ?? $u->name,
                'commission_percent' => $u->creatorProfile?->commission_percent,
                'books_count' => $u->created_books_count,
                'balance' => CreatorLedger::balance($u->id),
            ]),
        ]);
    }

    /** Jadikan/cabut kreator — hanya admin yang bisa (sesuai kebijakan Srawung). */
    public function setCreator(Request $request, $id)
    {
        $data = $request->validate([
            'enabled' => 'required|boolean',
            'display_name' => 'nullable|string|max:100',
            'commission_percent' => 'nullable|integer|min:0|max:90',
        ]);
        $user = User::findOrFail($id);
        if ($user->role === 'admin') {
            return response()->json(['message' => 'Akun admin tidak bisa dijadikan kreator.'], 422);
        }

        if ($data['enabled']) {
            $user->forceFill(['role' => 'creator'])->save();
            $profile = $user->creatorProfile()->firstOrCreate([], ['display_name' => $data['display_name'] ?? $user->name]);
            $profile->update(array_filter([
                'display_name' => $data['display_name'] ?? null,
            ]) + ['commission_percent' => $data['commission_percent'] ?? $profile->commission_percent]);
            $msg = "{$user->name} sekarang kreator. Menu \"Dashboard kreator\" muncul di akunnya.";
        } else {
            // Buku tetap ada (pembeli tetap bisa membaca), tetapi kreator tidak bisa mengelolanya lagi.
            $user->forceFill(['role' => 'buyer'])->save();
            $msg = "Akses kreator {$user->name} dicabut. Bukunya tetap tersedia dan dikelola admin; saldo tetap tercatat.";
        }

        return response()->json(['message' => $msg]);
    }

    public function updateCommission(Request $request, $id)
    {
        $data = $request->validate(['commission_percent' => 'nullable|integer|min:0|max:90']);
        $user = User::where('role', 'creator')->findOrFail($id);
        $user->creatorProfile()->firstOrCreate([], ['display_name' => $user->name])->update($data);

        return response()->json(['message' => 'Komisi diperbarui. Berlaku untuk penjualan berikutnya.']);
    }

    public function payouts(Request $request)
    {
        $q = CreatorPayout::with('creator:id,name,email', 'creator.creatorProfile:id,user_id,display_name')->latest();
        if ($request->filled('status')) {
            $q->where('status', $request->status);
        }

        return response()->json($q->paginate(20));
    }

    public function markPaid(Request $request, $id)
    {
        $data = $request->validate([
            'reference' => 'nullable|string|max:120',
            'proof' => 'nullable|file|mimes:jpg,jpeg,png,pdf|max:20480',
        ]);
        $payout = CreatorPayout::where('status', 'requested')->findOrFail($id);
        $path = $request->hasFile('proof') ? $request->file('proof')->store("payouts/{$payout->id}", 'local') : null;

        // Klaim atomik: dua klik bersamaan tidak memproses pengajuan yang sama dua kali.
        $claimed = CreatorPayout::whereKey($payout->id)->where('status', 'requested')->update([
            'status' => 'paid',
            'reference' => $data['reference'] ?? null,
            'proof_path' => $path,
            'processed_by' => $request->user()->id,
            'processed_at' => now(),
        ]);
        abort_unless($claimed, 409, 'Pengajuan ini sudah diproses.');
        $payout->refresh();
        \App\Services\Security\SecurityLog::record('payout.paid', $request->user(), ['payout' => $payout->id, 'amount' => (int) $payout->amount]);
        $this->notify($payout);

        return response()->json(['message' => 'Penarikan ditandai sudah dibayar. Kreator menerima email konfirmasi.']);
    }

    public function reject(Request $request, $id)
    {
        $data = $request->validate(['note' => 'required|string|max:500']);
        $payout = CreatorPayout::where('status', 'requested')->findOrFail($id);
        $claimed = CreatorPayout::whereKey($payout->id)->where('status', 'requested')
            ->update(['status' => 'rejected', 'note' => $data['note'], 'processed_by' => $request->user()->id, 'processed_at' => now()]);
        abort_unless($claimed, 409, 'Pengajuan ini sudah diproses.');
        $payout->refresh();
        $this->notify($payout);

        return response()->json(['message' => 'Pengajuan ditolak. Saldo dikembalikan ke kreator.']);
    }

    public function proof($id)
    {
        $payout = CreatorPayout::findOrFail($id);
        abort_unless($payout->proofExists(), 404);

        return Storage::disk('local')->response($payout->proof_path, null, ['Content-Security-Policy' => "default-src 'none'; sandbox", 'Cache-Control' => 'private, no-store']);
    }

    private function notify(CreatorPayout $payout): void
    {
        try {
            $payout->creator?->notify(new PayoutProcessed($payout));
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
