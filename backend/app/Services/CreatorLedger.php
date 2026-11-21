<?php

namespace App\Services;

use App\Models\Book;
use App\Models\Coupon;
use App\Models\CreatorEarning;
use App\Models\CreatorPayout;
use App\Models\Order;
use App\Models\Setting;
use App\Models\User;

/**
 * Bagi hasil kreator.
 *
 *  - Pembayaran pembeli (QRIS) masuk ke Srawung. Saat admin mengonfirmasi pesanan, setiap
 *    buku milik kreator dicatat di buku besar (creator_earnings):
 *        gross      = harga buku − diskon VOUCHER KREATOR (kupon Srawung ditanggung Srawung)
 *        commission = gross × komisi% (default 20%, bisa khusus per kreator)
 *        net        = gross − commission  → saldo kreator
 *  - Saldo tersedia = total net − penarikan yang diajukan/dibayar.
 */
class CreatorLedger
{
    public static function defaultCommission(): int
    {
        return max(0, min(90, (int) Setting::get('creator_commission_percent', '20')));
    }

    public static function minPayout(): int
    {
        return max(10000, (int) Setting::get('creator_min_payout', '100000'));
    }

    /** Biaya admin per penarikan (dipotong dari jumlah yang ditarik). Selalu lebih kecil dari minimal penarikan. */
    public static function payoutFee(): int
    {
        return max(0, min(self::minPayout() - 1000, (int) Setting::get('creator_payout_fee', '5000')));
    }

    public static function commissionFor(User $creator): int
    {
        return $creator->creatorProfile?->commission_percent ?? self::defaultCommission();
    }

    /** Dipanggil setelah pesanan dikonfirmasi. Aman dipanggil berulang (unik per order_item). */
    public static function recordOrder(Order $order): int
    {
        $order->loadMissing('orderItems.book', 'coupon');
        $creatorCoupon = $order->coupon?->creator_id;
        $created = 0;
        $perCreator = []; // creator_id => list<CreatorEarning> baru

        foreach ($order->orderItems as $item) {
            $creatorId = $item->book?->creator_id;
            if (!$creatorId) {
                continue; // buku milik Srawung
            }
            $creator = User::with('creatorProfile')->find($creatorId);
            if (!$creator) {
                continue;
            }

            // Diskon voucher kreator mengurangi pendapatan kreator; kupon Srawung tidak.
            $gross = (int) $item->price - ($creatorCoupon === $creatorId ? (int) $item->discount : 0);
            $gross = max(0, $gross);
            $percent = self::commissionFor($creator);
            $commission = (int) round($gross * $percent / 100);

            $earning = CreatorEarning::firstOrCreate(['order_item_id' => $item->id], [
                'creator_id' => $creatorId,
                'order_id' => $order->id,
                'book_id' => $item->book_id,
                'gross' => $gross,
                'commission_percent' => $percent,
                'commission' => $commission,
                'net' => $gross - $commission,
            ]);
            if ($earning->wasRecentlyCreated) {
                $created++;
                $perCreator[$creatorId][] = $earning;
            }
        }

        foreach ($perCreator as $creatorId => $earnings) {
            try {
                User::find($creatorId)?->notify(new \App\Notifications\CreatorSale($earnings));
            } catch (\Throwable $e) {
                report($e);
            }
        }

        return $created;
    }

    /**
     * Koreksi pendapatan kreator dari pesanan yang di-refund. Baris pendapatan ditandai
     * "dikoreksi" (tidak dihapus, agar riwayat tetap jelas) dan tidak lagi dihitung di saldo.
     * Bila saldonya sudah terlanjur ditarik, selisihnya menjadi saldo minus yang otomatis
     * terpotong dari penjualan berikutnya.
     *
     * @return int jumlah baris yang dikoreksi
     */
    public static function reverseOrder(Order $order, string $reason): int
    {
        $rows = CreatorEarning::with('book:id,title')->where('order_id', $order->id)->whereNull('reversed_at')->get();
        if ($rows->isEmpty()) {
            return 0;
        }
        CreatorEarning::whereIn('id', $rows->pluck('id'))->update(['reversed_at' => now(), 'reversal_reason' => mb_substr($reason, 0, 255)]);

        foreach ($rows->groupBy('creator_id') as $creatorId => $items) {
            if ($creator = User::find($creatorId)) {
                try {
                    $creator->notify(new \App\Notifications\CreatorSaleReversed($order->order_number, $items->map(fn ($e) => [
                        'title' => $e->book?->title ?? 'Buku', 'net' => (int) $e->net,
                    ])->values()->all(), $reason));
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        return $rows->count();
    }

    /** @return array{earned: int, gross: int, commission: int, reversed: int, paid: int, pending: int, available: int, debt: int} */
    public static function balance(int $creatorId): array
    {
        $e = CreatorEarning::where('creator_id', $creatorId)->whereNull('reversed_at')
            ->selectRaw('COALESCE(SUM(net),0) net, COALESCE(SUM(gross),0) gross, COALESCE(SUM(commission),0) commission')->first();
        $reversed = (int) CreatorEarning::where('creator_id', $creatorId)->whereNotNull('reversed_at')->sum('net');
        $paid = (int) CreatorPayout::where('creator_id', $creatorId)->where('status', 'paid')->sum('amount');
        $pending = (int) CreatorPayout::where('creator_id', $creatorId)->where('status', 'requested')->sum('amount');

        return [
            'earned' => (int) $e->net,
            'gross' => (int) $e->gross,
            'commission' => (int) $e->commission,
            'reversed' => $reversed,
            'paid' => $paid,
            'pending' => $pending,
            'available' => max(0, (int) $e->net - $paid - $pending),
            // Saldo minus akibat koreksi refund setelah saldo ditarik; terpotong dari penjualan berikutnya.
            'debt' => max(0, $paid + $pending - (int) $e->net),
        ];
    }

    /**
     * Bagi diskon kupon ke buku-buku yang berhak, sebanding harganya.
     * Kupon Srawung → semua buku; voucher kreator → hanya buku kreator tsb.
     *
     * @param  list<array{book_id: int, bundle_id: ?int, price: int}>  $items
     * @return array{eligible: int, shares: array<int, int>} indeks item => diskon
     */
    public static function eligibility(?Coupon $coupon, array $items): array
    {
        if (!$coupon) {
            return ['eligible' => 0, 'shares' => []];
        }
        $owners = $coupon->creator_id
            ? Book::whereIn('id', array_column($items, 'book_id'))->pluck('creator_id', 'id')->all()
            : [];
        // Voucher yang dibatasi ke buku tertentu: hanya buku pilihan yang didiskon.
        $allowed = $coupon->restrict_books ? array_flip($coupon->books()->pluck('books.id')->all()) : null;

        $idx = [];
        foreach ($items as $i => $item) {
            $ownerOk = !$coupon->creator_id || (int) ($owners[$item['book_id']] ?? 0) === (int) $coupon->creator_id;
            $bookOk = $allowed === null || isset($allowed[$item['book_id']]);
            if ($ownerOk && $bookOk) {
                $idx[] = $i;
            }
        }

        return ['eligible' => (int) array_sum(array_map(fn ($i) => $items[$i]['price'], $idx)), 'shares' => array_fill_keys($idx, 0)];
    }

    /** @return array<int, int> indeks item => bagian diskon (jumlahnya tepat = $discount) */
    public static function allocate(int $discount, array $items, array $eligibleIdx): array
    {
        $total = array_sum(array_map(fn ($i) => $items[$i]['price'], $eligibleIdx));
        $out = [];
        $left = $discount;
        foreach (array_values($eligibleIdx) as $n => $i) {
            $share = $n === count($eligibleIdx) - 1 ? $left : ($total > 0 ? (int) floor($discount * $items[$i]['price'] / $total) : 0);
            $share = min($share, $items[$i]['price']);
            $out[$i] = $share;
            $left -= $share;
        }

        return $out;
    }
}
