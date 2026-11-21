<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\PaymentProof;
use App\Models\Setting;
use App\Notifications\OrderRejected;
use App\Services\InvoicePdf;
use App\Services\OrderLifecycle;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class OrderController extends Controller
{
    public function index(Request $request)
    {
        OrderLifecycle::expireDue();

        $query = Order::with(['user', 'orderItems.book', 'orderItems.bundle:id,title', 'latestProof'])->latest();

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('order_number', 'like', "%{$search}%")
                  ->orWhereHas('user', function ($uq) use ($search) {
                      $uq->where('name', 'like', "%{$search}%")
                         ->orWhere('email', 'like', "%{$search}%");
                  });
            });
        }

        $orders = $query->withCount(['paymentProofs as flagged_proofs_count' => fn ($q) => $q->whereNotNull('risk_flags')])->paginate(15);
        return response()->json($orders);
    }

    public function show($id)
    {
        $order = Order::with([
            'user',
            'orderItems.book',
            'orderItems.bundle:id,title',
            'paymentProofs',
            'statusLogs.actor',
            'confirmedByUser',
            'coupon',
            'refundedByUser:id,name',
        ])->findOrFail($id);

        $payload = $order->toArray();
        foreach ($order->paymentProofs as $i => $proof) {
            $payload['payment_proofs'][$i]['check'] = \App\Services\ProofInspector::summary($proof);
        }

        return response()->json($payload);
    }

    /**
     * Tampilkan file bukti transfer (disimpan privat di disk local).
     */
    public function proofFile($id, $proofId)
    {
        $proof = PaymentProof::where('order_id', $id)->findOrFail($proofId);

        if (!\Illuminate\Support\Facades\Storage::disk('local')->exists($proof->file_path)) {
            return response()->json(['message' => 'File bukti tidak ditemukan.'], 404);
        }

        return \Illuminate\Support\Facades\Storage::disk('local')->response($proof->file_path, null, [
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function invoice($id)
    {
        $order = Order::findOrFail($id);

        return response(InvoicePdf::render($order), 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => 'attachment; filename="' . InvoicePdf::filename($order) . '"',
            'Cache-Control' => 'private, no-store',
        ]);
    }

    public function confirm(Request $request, $id)
    {
        $order = Order::with(['user', 'orderItems'])->findOrFail($id);

        if (!OrderLifecycle::confirm($order, $request->user())) {
            return response()->json([
                'message' => 'Pesanan tidak dalam status yang dapat dikonfirmasi.',
            ], 400);
        }

        $order->refresh();

        return response()->json([
            'message' => 'Pesanan berhasil dikonfirmasi dan akses buku telah aktif.',
            'order' => $order->fresh(['user', 'orderItems.book', 'paymentProofs', 'statusLogs']),
            'whatsapp_url' => $this->buildWhatsAppUrl($order->user, $order, 'dikonfirmasi'),
        ]);
    }

    public function reject(Request $request, $id)
    {
        $request->validate([
            'reason' => 'required|string|max:1000',
        ]);

        $order = Order::with('user')->findOrFail($id);

        if (in_array($order->status, ['dikonfirmasi', 'kedaluwarsa', 'ditolak'], true)) {
            return response()->json(['message' => 'Pesanan dengan status ini tidak dapat ditolak.'], 400);
        }

        $admin = $request->user();
        $reason = $request->reason;

        DB::transaction(function () use ($order, $admin, $reason) {
            $prevStatus = $order->status;

            // Beri pembeli tenggat baru untuk unggah ulang. Bila terlewat, pesanan
            // kedaluwarsa otomatis dan kuota kuponnya dikembalikan.
            $order->update([
                'status' => 'ditolak',
                'payment_deadline' => Carbon::now()->addHours((int) Setting::get('payment_deadline_hours', '24')),
                'reminder_sent_at' => null, // tenggat baru → boleh diingatkan lagi
            ]);

            PaymentProof::where('order_id', $order->id)
                ->where('status', 'pending')
                ->update([
                    'status' => 'rejected',
                    'rejection_reason' => $reason,
                ]);

            OrderStatusLog::create([
                'order_id' => $order->id,
                'from_status' => $prevStatus,
                'to_status' => 'ditolak',
                'actor_id' => $admin ? $admin->id : null,
            ]);
        });

        $user = $order->user;
        $waUrl = $this->buildWhatsAppUrl($user, $order, 'ditolak', $reason);

        $this->notifyBuyer($user, new OrderRejected($order->fresh(['orderItems.book']), $reason));

        return response()->json([
            'message' => 'Pesanan berhasil ditolak.',
            'order' => $order->fresh(['user', 'paymentProofs', 'statusLogs']),
            'whatsapp_url' => $waUrl,
        ]);
    }

    /** Refund pesanan yang sudah dikonfirmasi (dana dikembalikan manual ke pembeli). */
    public function refund(Request $request, $id)
    {
        $data = $request->validate([
            'reason' => 'required|string|min:5|max:500',
            'revoke_access' => 'boolean',
            'reference' => 'nullable|string|max:120',
        ]);
        $order = Order::with('user')->findOrFail($id);
        $revoke = $request->boolean('revoke_access', true);

        if (!\App\Services\OrderLifecycle::refund($order, $request->user(), $data['reason'], $revoke, $data['reference'] ?? null)) {
            return response()->json(['message' => 'Hanya pesanan yang sudah dikonfirmasi yang bisa di-refund.'], 422);
        }

        return response()->json([
            'message' => 'Pesanan ditandai sudah di-refund.' . ($revoke ? ' Akses buku dicabut.' : '') . ' Pendapatan kreator terkait sudah dikoreksi.',
            'order' => $order->fresh(['user', 'orderItems.book', 'paymentProofs', 'statusLogs.actor']),
        ]);
    }

    private function notifyBuyer($user, $notification): void
    {
        if (!$user) {
            return;
        }

        try {
            $user->notify($notification);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function buildWhatsAppUrl($user, $order, $statusText, $reason = '')
    {
        if (!$user || !$user->whatsapp) {
            return null;
        }

        $phone = preg_replace('/[^0-9]/', '', $user->whatsapp);
        if (str_starts_with($phone, '08')) {
            $phone = '628' . substr($phone, 2);
        }

        $template = Setting::get(
            'payment_message_template',
            'Halo {nama}, pesanan #{nomor} senilai Rp {total} telah {status}. Terima kasih!'
        );

        $statusLabel = $statusText === 'dikonfirmasi' ? 'DIKONFIRMASI' : "DITOLAK (Alasan: {$reason})";

        $message = str_replace(
            ['{nama}', '{nomor}', '{total}', '{status}'],
            [$user->name, $order->order_number, number_format($order->total, 0, ',', '.'), $statusLabel],
            $template
        );

        return "https://wa.me/{$phone}?text=" . urlencode($message);
    }
}
