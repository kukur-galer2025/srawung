<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Services\Security\LoginSession;
use App\Services\Security\SecurityLog;
use App\Services\Security\TwoFactor;
use Illuminate\Console\Command;

/** Ponsel hilang & kode pemulihan habis: matikan 2FA dari server (butuh akses SSH). */
class ResetTwoFactor extends Command
{
    protected $signature = 'srawung:reset-2fa {email}';

    protected $description = 'Matikan verifikasi dua langkah sebuah akun dan keluarkan semua perangkatnya';

    public function handle(): int
    {
        $user = User::where('email', strtolower((string) $this->argument('email')))->first();
        if (!$user) {
            $this->error('Akun tidak ditemukan.');

            return self::FAILURE;
        }
        TwoFactor::disable($user);
        LoginSession::revokeAll($user);
        SecurityLog::record('2fa.reset_cli', $user);
        $this->info("2FA {$user->email} dimatikan. Semua perangkat dikeluarkan; aktifkan lagi setelah masuk.");

        return self::SUCCESS;
    }
}
