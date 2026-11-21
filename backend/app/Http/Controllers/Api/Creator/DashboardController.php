<?php

namespace App\Http\Controllers\Api\Creator;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\CreatorEarning;
use App\Models\CreatorPayout;
use App\Notifications\PayoutRequested;
use App\Services\CreatorLedger;
use App\Services\CreatorTerms;
use App\Services\OrderLifecycle;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function summary(Request $request)
    {
        $id = $request->user()->id;
        $monthStart = now()->startOfMonth();

        $month = CreatorEarning::where('creator_id', $id)->whereNull('reversed_at')->where('created_at', '>=', $monthStart)
            ->selectRaw('COUNT(*) sold, COALESCE(SUM(net),0) net')->first();

        $perBook = Book::where('books.creator_id', $id)
            ->leftJoin('creator_earnings as e', fn ($j) => $j->on('e.book_id', '=', 'books.id')->whereNull('e.reversed_at'))
            ->groupBy('books.id', 'books.title', 'books.slug', 'books.status', 'books.cover_path', 'books.price', 'books.processing_status')
            ->orderByDesc(DB::raw('COALESCE(SUM(e.net),0)'))
            ->get(['books.id', 'books.title', 'books.slug', 'books.status', 'books.cover_path', 'books.price', 'books.processing_status', DB::raw('COUNT(e.id) as sold'), DB::raw('COALESCE(SUM(e.net),0) as net')]);

        return response()->json([
            'profile' => $request->user()->creatorProfile,
            'commission_percent' => CreatorLedger::commissionFor($request->user()->loadMissing('creatorProfile')),
            'min_payout' => CreatorLedger::minPayout(),
            'payout_fee' => CreatorLedger::payoutFee(),
            'terms' => CreatorTerms::statusFor($request->user()->creatorProfile),
            'balance' => CreatorLedger::balance($id),
            'month' => ['sold' => (int) $month->sold, 'net' => (int) $month->net],
            'books' => $perBook->map(fn ($b) => [
                'id' => $b->id, 'title' => $b->title, 'slug' => $b->slug, 'status' => $b->status,
                'cover_url' => $b->cover_url, 'price' => (int) $b->price, 'processing_status' => $b->processing_status,
                'sold' => (int) $b->sold, 'net' => (int) $b->net,
            ]),
            'recent' => $this->earnings($id)->limit(8)->get(),
        ]);
    }

    /** Alur Dilihat → Keranjang → Checkout → Dibeli per buku milik kreator. */
    public function analytics(Request $request, \App\Services\CreatorAnalytics $analytics)
    {
        return response()->json($analytics->forCreator($request->user()->id, (int) $request->query('days', 30)));
    }

    public function earningsIndex(Request $request)
    {
        return response()->json($this->earnings($request->user()->id)->paginate(20));
    }

    public function profile(Request $request)
    {
        return response()->json($request->user()->creatorProfile);
    }

    public function updateProfile(Request $request)
    {
        $data = $request->validate([
            'display_name' => 'required|string|max:100',
            'bio' => 'nullable|string|max:1000',
            'payout_method' => 'nullable|in:bank,ewallet',
            'payout_provider' => 'nullable|required_with:payout_method|string|max:60',
            'payout_account' => ['nullable', 'required_with:payout_method', 'string', 'max:60', 'regex:/^[0-9 \-]+$/'],
            'payout_holder' => 'nullable|required_with:payout_method|string|max:120',
        ], ['payout_account.regex' => 'Nomor rekening/e-wallet hanya berisi angka.']);

        $profile = $request->user()->creatorProfile()->firstOrCreate([], ['display_name' => $request->user()->name]);
        $profile->update($data);

        return response()->json(['message' => 'Profil kreator disimpan.', 'profile' => $profile]);
    }

    /** Kreator menyetujui Syarat & Ketentuan Kreator versi yang berlaku. */
    public function acceptTerms(Request $request)
    {
        $data = $request->validate([
            'version' => 'required|string|in:' . CreatorTerms::VERSION,
            'agree' => 'accepted',
        ], [
            'version.in' => 'Syarat & Ketentuan sudah diperbarui. Muat ulang halaman lalu baca versi terbaru.',
            'agree.accepted' => 'Centang persetujuan Syarat & Ketentuan Kreator terlebih dahulu.',
        ]);

        $profile = $request->user()->creatorProfile()->firstOrCreate([], ['display_name' => $request->user()->name]);
        $profile->update(['terms_version' => $data['version'], 'terms_accepted_at' => now()]);
        $request->user()->setRelation('creatorProfile', $profile);

        return response()->json(['message' => 'Terima kasih, Syarat & Ketentuan Kreator telah disetujui.', 'terms' => CreatorTerms::statusFor($profile)]);
    }

    public function payouts(Request $request)
    {
        return response()->json(CreatorPayout::where('creator_id', $request->user()->id)->latest()->paginate(20));
    }

    public function requestPayout(Request $request)
    {
        $user = $request->user();
        // Selalu ambil data rekening terbaru dari database.
        $profile = $user->creatorProfile()->first();
        $data = $request->validate(
            ['amount' => 'required|integer|min:1', 'agree' => 'accepted'],
            ['agree.accepted' => 'Centang persetujuan biaya admin & Syarat & Ketentuan Kreator terlebih dahulu.'],
        );

        if (!$profile || !$profile->acceptedCurrentTerms()) {
            return response()->json(['message' => 'Setujui Syarat & Ketentuan Kreator terlebih dahulu.', 'code' => 'terms_required'], 422);
        }
        if (!$profile->hasPayoutAccount()) {
            return response()->json(['message' => 'Lengkapi rekening atau e-wallet pencairan terlebih dahulu.'], 422);
        }

        $payout = DB::transaction(function () use ($user, $profile, $data) {
            // Kunci baris kreator agar dua pengajuan bersamaan tidak melebihi saldo.
            DB::table('users')->where('id', $user->id)->lockForUpdate()->first();

            if (CreatorPayout::where('creator_id', $user->id)->where('status', 'requested')->exists()) {
                abort(response()->json(['message' => 'Masih ada pengajuan yang sedang diproses admin.'], 422));
            }
            $balance = CreatorLedger::balance($user->id);
            $min = CreatorLedger::minPayout();
            if ($data['amount'] < $min) {
                abort(response()->json(['message' => 'Minimal penarikan Rp' . number_format($min, 0, ',', '.') . '.'], 422));
            }
            if ($data['amount'] > $balance['available']) {
                abort(response()->json(['message' => 'Saldo tersedia tidak mencukupi.'], 422));
            }

            // Biaya admin dipotong dari jumlah yang ditarik; saldo berkurang sebesar jumlah yang ditarik.
            $fee = CreatorLedger::payoutFee();

            return CreatorPayout::create([
                'creator_id' => $user->id,
                'amount' => $data['amount'],
                'fee' => $fee,
                'net_amount' => $data['amount'] - $fee,
                'terms_version' => $profile->terms_version,
                'status' => 'requested',
                'payout_method' => $profile->payout_method,
                'payout_provider' => $profile->payout_provider,
                'payout_account' => $profile->payout_account,
                'payout_holder' => $profile->payout_holder,
            ]);
        });

        OrderLifecycle::notifyAdmin(new PayoutRequested($payout));

        $net = 'Rp' . number_format($payout->net_amount, 0, ',', '.');

        return response()->json(['message' => "Pengajuan penarikan terkirim. {$net} akan ditransfer admin dalam 1–3 hari kerja.", 'payout' => $payout], 201);
    }

    private function earnings(int $creatorId)
    {
        return CreatorEarning::with(['book:id,title,slug', 'order:id,order_number,confirmed_at'])
            ->where('creator_id', $creatorId)
            ->latest('id');
    }
}
