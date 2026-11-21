<?php

namespace App\Console\Commands;

use App\Models\Book;
use App\Models\User;
use App\Models\Wishlist;
use App\Notifications\WishlistOnSale;
use Illuminate\Console\Command;

/**
 * Kirim email ke pembaca yang menyimpan buku di wishlist saat buku itu sedang promo.
 * Tiap promo (harga + tanggal berakhir) hanya diberitahukan sekali per pembaca.
 */
class SendWishlistSaleAlerts extends Command
{
    protected $signature = 'amania:wishlist-sale-alerts';

    protected $description = 'Email pemberitahuan promo untuk buku di wishlist';

    public static function saleKey(Book $book): string
    {
        return $book->sale_price . '|' . ($book->sale_ends_at?->timestamp ?? 'open');
    }

    public function handle(): int
    {
        $books = Book::where('status', 'published')->onSale()->get()->keyBy('id');
        if ($books->isEmpty()) {
            return self::SUCCESS;
        }

        $pending = Wishlist::whereIn('book_id', $books->keys())->get()
            ->filter(fn (Wishlist $w) => $w->notified_sale_key !== self::saleKey($books[$w->book_id]))
            ->groupBy('user_id');

        $sent = 0;
        foreach ($pending as $userId => $items) {
            $user = User::find($userId);
            // Hanya akun aktif dengan email terverifikasi.
            if (!$user || $user->is_blocked || $user->anonymized_at || !$user->hasVerifiedEmail() || !$user->reminder_emails) {
                continue;
            }

            $user->notify(new WishlistOnSale($items->pluck('book_id')->unique()->values()->all()));
            foreach ($items as $w) {
                $w->update(['notified_sale_key' => self::saleKey($books[$w->book_id]), 'notified_at' => now()]);
            }
            $sent++;
        }

        $this->info("Email promo wishlist dikirim ke {$sent} pembaca.");

        return self::SUCCESS;
    }
}
