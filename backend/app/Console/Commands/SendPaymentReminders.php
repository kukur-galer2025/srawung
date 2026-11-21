<?php

namespace App\Console\Commands;

use App\Services\OrderLifecycle;
use Illuminate\Console\Command;

class SendPaymentReminders extends Command
{
    protected $signature = 'amania:payment-reminders';
    protected $description = 'Kirim email pengingat untuk pesanan yang batas waktunya tinggal ≤ 3 jam';

    public function handle(): int
    {
        $this->info('Pengingat dikirim: ' . OrderLifecycle::sendDueReminders());

        return self::SUCCESS;
    }
}
