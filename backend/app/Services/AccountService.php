<?php

namespace App\Services;

use App\Models\Book;
use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Hak pemilik data (UU No. 27/2022 tentang Pelindungan Data Pribadi):
 *  - anonymize(): hapus akun. Data pribadi dihapus; catatan transaksi (pesanan, bukti
 *    bayar) tetap disimpan tanpa identitas karena wajib untuk pembukuan.
 */
class AccountService
{
    /** Pesanan yang menghalangi penghapusan (pembayaran sedang diverifikasi admin). */
    public function blockingOrders(User $user): \Illuminate\Support\Collection
    {
        return Order::where('user_id', $user->id)->where('status', 'menunggu_verifikasi')->pluck('order_number');
    }

    public function anonymize(User $user): void
    {
        DB::transaction(function () use ($user) {
            // Pesanan yang belum dibayar dibatalkan (kuota kupon dikembalikan), tanpa email.
            foreach (Order::where('user_id', $user->id)->whereIn('status', OrderLifecycle::EXPIRABLE)->lockForUpdate()->get() as $order) {
                $from = $order->status;
                $order->update(['status' => 'kedaluwarsa']);
                OrderStatusLog::create(['order_id' => $order->id, 'from_status' => $from, 'to_status' => 'kedaluwarsa', 'actor_id' => $user->id]);
                OrderLifecycle::releaseCoupon($order);
            }

            $reviewedBooks = DB::table('reviews')->where('user_id', $user->id)->pluck('book_id');

            foreach (['reviews', 'wishlists', 'bookmarks', 'reader_notes', 'reading_sessions', 'user_library', 'access_logs', 'reader_flags', 'carts'] as $table) {
                DB::table($table)->where('user_id', $user->id)->delete();
            }
            // Langganan newsletter (berdasarkan email) ikut dihapus.
            DB::table('newsletter_subscribers')->where('email', strtolower($user->email))->orWhere('user_id', $user->id)->delete();
            DB::table('book_views')->where('user_id', $user->id)->update(['user_id' => null]);
            $user->tokens()->delete();

            $user->forceFill([
                'name' => 'Pengguna terhapus',
                'email' => "terhapus-{$user->id}-" . Str::lower(Str::random(6)) . '@amania.invalid',
                'whatsapp' => null,
                'google_id' => null,
                'avatar' => null,
                'password' => Hash::make(Str::random(64)),
                'remember_token' => null,
                'two_factor_secret' => null,
                'two_factor_recovery' => null,
                'two_factor_confirmed_at' => null,
                'preferred_categories' => null,
                'email_verified_at' => null,
                'reminder_emails' => false,
                'is_blocked' => true,
                'anonymized_at' => now(),
            ])->save();

            Book::whereIn('id', $reviewedBooks)->get()->each->refreshRating();
        });
    }
}
