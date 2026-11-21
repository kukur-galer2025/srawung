<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Cart;
use App\Models\Coupon;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\OrderStatusLog;
use App\Models\PaymentProof;
use App\Models\Setting;
use App\Notifications\NewOrderForAdmin;
use App\Notifications\NewPaymentProofForAdmin;
use App\Notifications\PaymentProofReceived;
use App\Services\CartPricing;
use App\Services\CreatorLedger;
use App\Services\InvoicePdf;
use App\Services\OrderLifecycle;
use App\Services\PaymentInfo;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class OrderController extends Controller
{
    public function index(Request $request)
    {
        // Pastikan status akurat walau scheduler sedang tidak berjalan.
        OrderLifecycle::expireDue($request->user()->id);

        $orders = Order::with(['orderItems.book', 'orderItems.bundle:id,title,slug', 'latestProof'])
            ->where('user_id', $request->user()->id)
            ->latest()
            ->paginate(10);

        return response()->json($orders);
    }

    public function show(Request $request, $orderNumber)
    {
        OrderLifecycle::expireDue($request->user()->id);

        $order = Order::with(['orderItems.book', 'orderItems.bundle:id,title,slug', 'paymentProofs', 'statusLogs', 'coupon'])
            ->where('user_id', $request->user()->id)
            ->where('order_number', $orderNumber)
            ->firstOrFail();

        return response()->json([
            'order' => $order,
            'payment_info' => PaymentInfo::get(),
        ]);
    }

    public function store(Request $request)
    {
        $user = $request->user();

        // Invoice & konfirmasi pembayaran dikirim lewat email → email harus valid & terverifikasi.
        if (!$user->hasVerifiedEmail()) {
            return response()->json([
                'message' => 'Verifikasi email Anda terlebih dahulu sebelum checkout. Invoice dan konfirmasi pembayaran dikirim ke email ini.',
                'code' => 'email_unverified',
            ], 403);
        }

        $request->validate([
            'book_ids' => 'nullable|array|max:100',
            'book_ids.*' => 'integer',
            'bundle_ids' => 'nullable|array|max:20',
            'bundle_ids.*' => 'integer',
        ]);

        $attribution = $this->attribution($request);

        // Kompatibel dengan format lama: items: [{id}] atau [id].
        $bookIds = (array) $request->input('book_ids', []);
        if (empty($bookIds) && $request->has('items')) {
            $bookIds = array_map(fn ($item) => is_array($item) ? ($item['id'] ?? $item['book_id']) : $item, (array) $request->input('items'));
        }
        $bundleIds = (array) $request->input('bundle_ids', []);

        if (empty($bookIds) && empty($bundleIds)) {
            return response()->json(['message' => 'Keranjang belanja kosong.'], 422);
        }

        // Harga efektif (promo, paket) dikunci saat pesanan dibuat — sumber yang sama dengan halaman keranjang.
        $quote = app(CartPricing::class)->quote($user, $bookIds, $bundleIds);

        if ($quote['owned_single_titles']) {
            return response()->json([
                'message' => 'Anda sudah memiliki buku berikut di perpustakaan: ' . implode(', ', $quote['owned_single_titles']),
            ], 422);
        }
        if (empty($quote['items'])) {
            return response()->json(['message' => 'Buku yang dipilih tidak ditemukan atau sudah tidak tersedia.'], 404);
        }

        $subtotal = $quote['subtotal'];
        $coupon = null;
        $discount = 0;
        $shares = []; // indeks item => bagian diskon kupon

        // Validasi kupon jika ada
        if ($request->filled('coupon_code')) {
            [$coupon, $discount, $error, $shares] = $this->resolveCoupon($request->coupon_code, $quote['items']);
            if ($error) {
                return response()->json(['message' => $error], 422);
            }
        }

        $baseAmount = max(0, $subtotal - $discount);
        $deadlineHours = (int) Setting::get('payment_deadline_hours', '24');
        $paymentDeadline = Carbon::now()->addHours($deadlineHours);

        // Pembeli membayar tepat sesuai harga (setelah diskon) — tanpa kode unik.
        $order = DB::transaction(function () use ($user, $quote, $coupon, $baseAmount, $paymentDeadline, $attribution, $shares) {
                    if ($coupon && !OrderLifecycle::claimCoupon($coupon)) {
                        abort(response()->json(['message' => 'Kuota kupon telah habis.'], 422));
                    }

                    $newOrder = Order::create([
                        'order_number' => 'AMN-' . strtoupper(Str::random(4)) . '-' . date('YmdHis'),
                        'user_id' => $user->id,
                        'total' => $baseAmount,
                        'coupon_id' => $coupon?->id,
                        'status' => 'menunggu_pembayaran',
                        'payment_deadline' => $paymentDeadline,
                        ...$attribution,
                    ]);

                    foreach ($quote['items'] as $i => $item) {
                        OrderItem::create(['order_id' => $newOrder->id, ...$item, 'discount' => $shares[$i] ?? 0]);
                    }

                    OrderStatusLog::create([
                        'order_id' => $newOrder->id,
                        'from_status' => null,
                        'to_status' => 'menunggu_pembayaran',
                        'actor_id' => $user->id,
                    ]);

                    return $newOrder;
        });

        // Total Rp0 (buku gratis / kupon 100%) tidak bisa dibayar lewat QRIS → langsung aktif.
        if ((int) $order->total === 0) {
            OrderLifecycle::confirm($order);
            $order->refresh();
        }

        // Keranjang di server ikut kosong → tidak ada pengingat "keranjang tertinggal".
        Cart::where('user_id', $user->id)->update(['book_ids' => [], 'bundle_ids' => [], 'content_updated_at' => now()]);

        $order->load(['orderItems.book', 'orderItems.bundle', 'coupon']);

        // Email ke admin: ada pesanan baru (diantrekan, tidak memperlambat checkout).
        OrderLifecycle::notifyAdmin(new NewOrderForAdmin($order));

        return response()->json([
            'message' => $order->status === 'dikonfirmasi' ? 'Pesanan gratis — buku langsung aktif.' : 'Pesanan berhasil dibuat.',
            'order' => $order,
            'payment_info' => PaymentInfo::get(),
        ], 201);
    }

    /**
     * Sumber kunjungan pembeli (UTM & referrer) untuk laporan pemasaran.
     * Demi privasi: referrer hanya disimpan domainnya, halaman pendaratan hanya path-nya.
     *
     * @return array<string, string|null>
     */
    private function attribution(Request $request): array
    {
        $a = (array) $request->input('attribution', []);
        $clean = fn ($v, int $max) => is_string($v) && trim($v) !== '' ? mb_substr(trim(strip_tags($v)), 0, $max) : null;

        $referrer = $clean($a['referrer'] ?? null, 500);
        $host = $referrer ? parse_url($referrer, PHP_URL_HOST) : null;
        $landing = $clean($a['landing_page'] ?? null, 500);
        $path = $landing ? parse_url($landing, PHP_URL_PATH) : null;

        return [
            'utm_source' => $clean($a['utm_source'] ?? null, 100) ? strtolower($clean($a['utm_source'], 100)) : null,
            'utm_medium' => $clean($a['utm_medium'] ?? null, 100) ? strtolower($clean($a['utm_medium'], 100)) : null,
            'utm_campaign' => $clean($a['utm_campaign'] ?? null, 100),
            'referrer' => $host ? mb_substr(strtolower(preg_replace('/^www\./', '', $host)), 0, 255) : null,
            'landing_page' => $path ? mb_substr($path, 0, 255) : null,
        ];
    }

    /**
     * Cek kupon dari halaman keranjang (sebelum checkout).
     */
    public function validateCoupon(Request $request)
    {
        $request->validate([
            'code' => 'required|string|max:50',
            'total' => 'nullable|numeric|min:0',
            'book_ids' => 'nullable|array|max:100',
            'book_ids.*' => 'integer',
            'bundle_ids' => 'nullable|array|max:20',
            'bundle_ids.*' => 'integer',
        ]);

        // Dengan isi keranjang → voucher kreator bisa dicek terhadap buku yang benar.
        $items = ($request->filled('book_ids') || $request->filled('bundle_ids'))
            ? app(CartPricing::class)->quote($request->user(), (array) $request->input('book_ids', []), (array) $request->input('bundle_ids', []))['items']
            : [['book_id' => 0, 'bundle_id' => null, 'price' => (int) $request->input('total', 0)]];

        [$coupon, $discount, $error] = $this->resolveCoupon($request->code, $items);
        if ($error) {
            return response()->json(['message' => $error], 422);
        }

        return response()->json([
            'code' => $coupon->code,
            'type' => $coupon->type,
            'value' => $coupon->value,
            'discount' => $discount,
            'creator' => $coupon->creator_id ? $coupon->creator?->creatorProfile?->display_name : null,
            'message' => $coupon->creator_id ? 'Voucher kreator dipasang untuk buku-buku kreator ini.' : 'Kupon berhasil dipasang.',
        ]);
    }

    /**
     * Kupon Srawung berlaku untuk semua buku; voucher kreator hanya untuk buku milik kreator tsb.
     * Diskon dibagi ke buku yang berhak (sebanding harga) → dasar bagi hasil kreator.
     *
     * @param  list<array{book_id: int, bundle_id: ?int, price: int}>  $items
     * @return array{0: ?Coupon, 1: int, 2: ?string, 3: array<int, int>} [kupon, diskon, error, bagian per item]
     */
    private function resolveCoupon(string $code, array $items): array
    {
        $coupon = Coupon::with('creator.creatorProfile')->where('code', strtoupper(trim($code)))->first()
            ?? Coupon::with('creator.creatorProfile')->where('code', trim($code))->first();

        if (!$coupon || ($coupon->creator_id && $coupon->creator?->role !== 'creator')) {
            return [null, 0, 'Kode kupon tidak valid.', []];
        }
        if ($coupon->expires_at && $coupon->expires_at->isPast()) {
            return [null, 0, 'Kupon telah kedaluwarsa.', []];
        }
        if ($coupon->quota !== null && $coupon->used_count >= $coupon->quota) {
            return [null, 0, 'Kuota kupon telah habis.', []];
        }

        $elig = CreatorLedger::eligibility($coupon, $items);
        if ($elig['eligible'] <= 0) {
            $name = $coupon->creator?->creatorProfile?->display_name ?? 'kreator ini';
            if ($coupon->restrict_books) {
                $titles = $coupon->books()->limit(3)->pluck('title')->implode(', ');

                return [null, 0, $titles ? "Voucher ini hanya berlaku untuk: {$titles}." : 'Voucher ini sudah tidak berlaku untuk buku mana pun.', []];
            }

            return [null, 0, $coupon->creator_id ? "Voucher ini hanya berlaku untuk buku dari {$name}." : 'Keranjang masih kosong.', []];
        }

        $discount = $coupon->type === 'percent'
            ? (int) round(($elig['eligible'] * $coupon->value) / 100)
            : (int) $coupon->value;
        $discount = min($discount, $elig['eligible']);

        return [$coupon, $discount, null, CreatorLedger::allocate($discount, $items, array_keys($elig['shares']))];
    }

    public function uploadProof(Request $request, $id)
    {
        $request->validate([
            'proof' => 'required|file|mimes:jpg,jpeg,png,pdf|max:5120',
            'buyer_note' => 'nullable|string|max:1000',
        ]);

        $order = Order::where('user_id', $request->user()->id)->where('id', $id)->firstOrFail();

        // Batas waktu sudah lewat → pesanan kedaluwarsa, bukti tidak diterima.
        if (in_array($order->status, OrderLifecycle::EXPIRABLE, true) && $order->payment_deadline?->isPast()) {
            OrderLifecycle::expire($order->id);

            return response()->json([
                'message' => 'Batas waktu pembayaran pesanan ini sudah lewat. Silakan buat pesanan baru, atau hubungi admin jika Anda sudah membayar.',
            ], 422);
        }

        if (!in_array($order->status, ['menunggu_pembayaran', 'ditolak'])) {
            return response()->json(['message' => 'Status pesanan saat ini tidak memungkinkan upload bukti.'], 400);
        }

        $file = $request->file('proof');
        $fileName = 'proof_' . time() . '_' . Str::random(10) . '.' . $file->getClientOriginalExtension();
        $filePath = $file->storeAs("proofs/{$order->id}", $fileName, 'local');

        $paymentProof = PaymentProof::create([
            'order_id' => $order->id,
            'file_path' => $filePath,
            'buyer_note' => $request->buyer_note,
            'status' => 'pending',
        ]);

        // Deteksi bukti yang dipakai ulang untuk pesanan lain (peringatan untuk admin).
        try {
            app(\App\Services\ProofInspector::class)->inspect($paymentProof);
        } catch (\Throwable $e) {
            report($e);
        }

        $previousStatus = $order->status;
        $order->update(['status' => 'menunggu_verifikasi']);

        OrderStatusLog::create([
            'order_id' => $order->id,
            'from_status' => $previousStatus,
            'to_status' => 'menunggu_verifikasi',
            'actor_id' => $request->user()->id,
        ]);

        // Email tanda terima ke pembeli (diantrekan, tidak memperlambat respons).
        try {
            $request->user()->notify(new PaymentProofReceived($order));
        } catch (\Throwable $e) {
            report($e);
        }
        OrderLifecycle::notifyAdmin(new NewPaymentProofForAdmin($order, $paymentProof));

        return response()->json([
            'message' => 'Bukti pembayaran berhasil diunggah. Menunggu verifikasi admin.',
            'proof' => $paymentProof,
            'order' => $order->fresh(['latestProof']),
        ]);
    }

    public function invoice(Request $request, $orderNumber)
    {
        $order = Order::where('user_id', $request->user()->id)
            ->where('order_number', $orderNumber)
            ->firstOrFail();

        return response(InvoicePdf::render($order), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . InvoicePdf::filename($order) . '"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function reuploadProof(Request $request, $id)
    {
        $order = Order::where('user_id', $request->user()->id)->where('id', $id)->firstOrFail();

        if ($order->status !== 'ditolak') {
            return response()->json(['message' => 'Unggah ulang bukti hanya dapat dilakukan jika pesanan ditolak.'], 400);
        }

        return $this->uploadProof($request, $id);
    }
}
