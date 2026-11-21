<?php

namespace App\Console\Commands;

use App\Services\OrderLifecycle;
use Illuminate\Console\Command;

class ExpireOrders extends Command
{
    protected $signature = 'amania:expire-orders';
    protected $description = 'Kedaluwarsakan pesanan yang melewati batas waktu pembayaran dan kembalikan kuota kuponnya';

    public function handle(): int
    {
        $count = OrderLifecycle::expireDue();
        $this->info("Pesanan kedaluwarsa: {$count}");

        return self::SUCCESS;
    }
}
