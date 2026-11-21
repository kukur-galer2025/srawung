<?php

namespace App\Console\Commands;

use App\Models\Cart;
use App\Models\Order;
use App\Notifications\AbandonedCartReminder;
use App\Services\CartPricing;
use Illuminate\Console\Command;

/**
 * Pengingat keranjang yang ditinggalkan. Dijalankan scheduler tiap 30 menit.
 *
 *  - Pengingat 1: 3 jam setelah isi keranjang terakhir berubah.
 *  - Pengingat 2: 48 jam setelahnya (bila masih belum checkout).
 *  - Tidak ada pengingat untuk keranjang yang lebih tua dari 7 hari, pengguna yang
 *    sudah checkout sejak itu, belum verifikasi email, diblokir, atau mematikan
 *    pengingat. Isi keranjang berubah → hitungan dimulai dari awal.
 */
class SendCartReminders extends Command
{
    protected $signature = 'amania:cart-reminders';

    protected $description = 'Kirim email pengingat untuk keranjang yang ditinggalkan';

    /** [urutan => jam setelah isi keranjang berubah] */
    public const SCHEDULE = [1 => 3, 2 => 48];

    public function handle(CartPricing $pricing): int
    {
        $sent = 0;

        foreach (self::SCHEDULE as $sequence => $hours) {
            $carts = Cart::with('user')
                ->where('reminder_count', $sequence - 1)
                ->whereNotNull('content_updated_at')
                ->where('content_updated_at', '<=', now()->subHours($hours))
                ->where('content_updated_at', '>=', now()->subDays(7))
                ->limit(200)
                ->get();

            foreach ($carts as $cart) {
                $user = $cart->user;
                if ($cart->isEmpty() || !$user || $user->is_blocked || $user->anonymized_at || !$user->hasVerifiedEmail() || !$user->reminder_emails) {
                    continue;
                }

                // Sudah checkout setelah keranjang terakhir diubah → bukan keranjang tertinggal.
                if (Order::where('user_id', $user->id)->where('created_at', '>=', $cart->content_updated_at)->exists()) {
                    continue;
                }

                $quote = $pricing->quote($user, $cart->book_ids ?? [], $cart->bundle_ids ?? []);
                $lines = array_values(array_filter($quote['lines'], fn ($l) => $l['available']));
                if (!$lines || $quote['subtotal'] <= 0) {
                    continue;
                }

                // Klaim atomik → tidak ada email ganda bila dua scheduler berjalan bersamaan.
                $claimed = Cart::whereKey($cart->id)->where('reminder_count', $sequence - 1)
                    ->update(['reminder_count' => $sequence, 'reminded_at' => now()]);
                if (!$claimed) {
                    continue;
                }

                try {
                    $user->notify(new AbandonedCartReminder($lines, $quote['subtotal'], $sequence));
                    $sent++;
                } catch (\Throwable $e) {
                    report($e);
                }
            }
        }

        $this->info("Pengingat keranjang terkirim: {$sent}");

        return self::SUCCESS;
    }
}
