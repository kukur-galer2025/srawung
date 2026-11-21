<?php

namespace App\Services;

use App\Models\Coupon;
use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\PaymentProof;
use App\Models\Setting;
use App\Models\User;
use App\Models\UserLibrary;
use App\Notifications\OrderConfirmed;
use App\Notifications\OrderExpired;
use App\Notifications\OrderRefunded;
use App\Notifications\PaymentReminder;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\DB;

/**
 * Aturan siklus hidup pesanan yang dipakai bersama oleh scheduler,
 * controller pembeli, dan controller admin.
 */
class OrderLifecycle
{
    /** Status yang masih menunggu aksi pembeli dan bisa kedaluwarsa. */
    public const EXPIRABLE = ['menunggu_pembayaran', 'ditolak'];

    /**
     * Kedaluwarsakan semua pesanan yang melewati batas waktu.
     * Dipanggil scheduler tiap beberapa menit, dan juga saat pesanan dibuka
     * (lazy) sehingga status tetap benar walau scheduler sedang mati.
     */
    public static function expireDue(?int $userId = null): int
    {
        $ids = Order::whereIn('status', self::EXPIRABLE)
            ->whereNotNull('payment_deadline')
            ->where('payment_deadline', '<', now())
            ->when($userId, fn ($q) => $q->where('user_id', $userId))
            ->pluck('id');

        $count = 0;
        foreach ($ids as $id) {
            $count += self::expire($id) ? 1 : 0;
        }

        return $count;
    }

    /**
     * Kedaluwarsakan satu pesanan (jika memang sudah lewat batas waktu)
     * dan kembalikan kuota kupon yang dipakainya.
     */
    public static function expire(int $orderId): bool
    {
        return DB::transaction(function () use ($orderId) {
            $order = Order::whereKey($orderId)->lockForUpdate()->first();

            if (
                !$order
                || !in_array($order->status, self::EXPIRABLE, true)
                || !$order->payment_deadline
                || $order->payment_deadline->isFuture()
            ) {
                return false;
            }

            $from = $order->status;
            $order->update(['status' => 'kedaluwarsa']);

            OrderStatusLog::create([
                'order_id' => $order->id,
                'from_status' => $from,
                'to_status' => 'kedaluwarsa',
                'actor_id' => null,
            ]);

            self::releaseCoupon($order);

            // Email terkirim setelah transaksi sukses (notifikasi memakai afterCommit).
            self::notifySafely($order->user, new OrderExpired($order));

            return true;
        });
    }

    /** Status yang masih bisa dikonfirmasi. */
    public const CONFIRMABLE = ['menunggu_pembayaran', 'menunggu_verifikasi'];

    /**
     * Konfirmasi pembayaran: aktifkan akses buku, catat bagi hasil
     * kreator, lalu kirim email konfirmasi + invoice ke pembeli. Dipakai admin dan
     * pesanan gratis (Rp0). Aman dari konfirmasi ganda (baris pesanan dikunci).
     *
     * @return bool false bila status pesanan tidak bisa dikonfirmasi
     */
    public static function confirm(Order $order, ?User $actor = null): bool
    {
        $confirmed = DB::transaction(function () use ($order, $actor) {
            $locked = Order::with('orderItems')->whereKey($order->id)->lockForUpdate()->first();
            if (!$locked || !in_array($locked->status, self::CONFIRMABLE, true)) {
                return false;
            }

            $from = $locked->status;
            $locked->update(['status' => 'dikonfirmasi', 'confirmed_at' => now(), 'confirmed_by' => $actor?->id]);

            PaymentProof::where('order_id', $locked->id)->where('status', 'pending')->update(['status' => 'approved']);

            foreach ($locked->orderItems as $item) {
                UserLibrary::updateOrCreate(
                    ['user_id' => $locked->user_id, 'book_id' => $item->book_id],
                    ['order_id' => $locked->id, 'access_status' => 'active', 'last_read_page' => 1],
                );
            }

            OrderStatusLog::create(['order_id' => $locked->id, 'from_status' => $from, 'to_status' => 'dikonfirmasi', 'actor_id' => $actor?->id]);

            return true;
        });

        if (!$confirmed) {
            return false;
        }

        $order->refresh();
        CreatorLedger::recordOrder($order);
        self::notifySafely($order->user, new OrderConfirmed($order->fresh(['orderItems.book'])));

        return true;
    }

    /**
     * Refund pesanan yang sudah dikonfirmasi (dana dikembalikan manual oleh admin):
     * status → "dikembalikan", akses buku dari pesanan ini dicabut (opsional), pendapatan
     * kreator dari pesanan ini dikoreksi, lalu pembeli & kreator diberi tahu.
     *
     * @return bool false bila pesanan tidak berstatus dikonfirmasi
     */
    public static function refund(Order $order, User $actor, string $reason, bool $revokeAccess = true, ?string $reference = null): bool
    {
        $done = DB::transaction(function () use ($order, $actor, $reason, $revokeAccess, $reference) {
            $locked = Order::whereKey($order->id)->lockForUpdate()->first();
            if (!$locked || $locked->status !== 'dikonfirmasi') {
                return false;
            }

            $locked->update([
                'status' => 'dikembalikan',
                'refunded_at' => now(),
                'refunded_by' => $actor->id,
                'refund_reason' => $reason,
                'refund_reference' => $reference,
            ]);
            if ($revokeAccess) {
                // Hanya akses yang berasal dari pesanan ini (buku yang juga dibeli lewat pesanan lain tetap aktif).
                UserLibrary::where('user_id', $locked->user_id)->where('order_id', $locked->id)->update(['access_status' => 'revoked']);
            }
            OrderStatusLog::create(['order_id' => $locked->id, 'from_status' => 'dikonfirmasi', 'to_status' => 'dikembalikan', 'actor_id' => $actor->id]);

            return true;
        });

        if (!$done) {
            return false;
        }

        $order->refresh();
        CreatorLedger::reverseOrder($order, 'Refund pesanan ' . $order->order_number . ': ' . $reason);
        self::notifySafely($order->user, new OrderRefunded($order->fresh(['orderItems.book']), $revokeAccess));

        return true;
    }

    /** Pengingat dikirim saat sisa waktu ≤ jam ini. */
    public const REMINDER_HOURS = 3;

    /**
     * Kirim email pengingat untuk pesanan yang tenggatnya tinggal ≤ 3 jam.
     * Satu pengingat per tenggat (direset saat admin menolak & memberi tenggat baru).
     */
    public static function sendDueReminders(): int
    {
        $orders = Order::with('user')
            ->whereIn('status', self::EXPIRABLE)
            ->whereNull('reminder_sent_at')
            ->whereBetween('payment_deadline', [now(), now()->addHours(self::REMINDER_HOURS)])
            // Jangan mengingatkan pesanan yang baru saja dibuat (mis. tenggat pendek).
            ->where('created_at', '<=', now()->subMinutes(30))
            ->get();

        $sent = 0;
        foreach ($orders as $order) {
            // Klaim atomik: hanya satu proses yang berhasil menandai → tidak ada email ganda.
            $claimed = Order::whereKey($order->id)->whereNull('reminder_sent_at')->update(['reminder_sent_at' => now()]);
            if ($claimed && self::notifySafely($order->user, new PaymentReminder($order))) {
                $sent++;
            }
        }

        return $sent;
    }

    /** Alamat email admin untuk notifikasi operasional (Pengaturan → email notifikasi admin). */
    public static function adminEmail(): ?string
    {
        $email = Setting::get('admin_notification_email')
            ?: \App\Models\User::where('role', 'admin')->where('is_blocked', false)->orderBy('id')->value('email')
            ?: config('mail.from.address');

        return filter_var($email, FILTER_VALIDATE_EMAIL) ? $email : null;
    }

    public static function notifyAdmin($notification): void
    {
        if ($email = self::adminEmail()) {
            try {
                Notification::route('mail', $email)->notify($notification);
            } catch (\Throwable $e) {
                Log::error('Gagal mengantrekan notifikasi admin: ' . $e->getMessage());
            }
        }
    }

    private static function notifySafely($user, $notification): bool
    {
        if (!$user) {
            return false;
        }
        try {
            $user->notify($notification);
            return true;
        } catch (\Throwable $e) {
            Log::error('Gagal mengantrekan email pesanan: ' . $e->getMessage());
            return false;
        }
    }

    /**
     * Ambil satu kuota kupon secara atomik. False bila kuota sudah habis
     * (aman dari dua checkout bersamaan yang berebut kuota terakhir).
     */
    public static function claimCoupon(Coupon $coupon): bool
    {
        return Coupon::whereKey($coupon->id)
            ->where(fn ($q) => $q->whereNull('quota')->orWhereColumn('used_count', '<', 'quota'))
            ->increment('used_count') > 0;
    }

    public static function releaseCoupon(Order $order): void
    {
        if ($order->coupon_id) {
            Coupon::whereKey($order->coupon_id)->where('used_count', '>', 0)->decrement('used_count');
        }
    }

}
