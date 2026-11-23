<?php

namespace App\Console\Commands;

use App\Models\Category;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Buat (atau perbarui) akun admin untuk SERVER PRODUKSI tanpa menjalankan db:seed
 * (seeder membuat akun demo bersandi "password123").
 *
 *   php artisan srawung:create-admin                       # interaktif, sandi disembunyikan
 *   php artisan srawung:create-admin --email=a@b.com --name="Nama"
 *
 * Sekaligus membuat kategori dasar bila tabel kategori masih kosong.
 */
class CreateAdmin extends Command
{
    protected $signature = 'srawung:create-admin {--name=} {--email=} {--whatsapp=}';

    protected $description = 'Buat akun admin produksi + kategori dasar (tanpa data demo)';

    private const CATEGORIES = ['Pemrograman', 'Teknologi & AI', 'Desain', 'Persiapan Ujian'];

    public function handle(): int
    {
        $name = $this->option('name') ?: $this->ask('Nama admin');
        $email = strtolower(trim((string) ($this->option('email') ?: $this->ask('Email admin'))));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('Alamat email tidak valid.');

            return self::FAILURE;
        }

        $password = (string) $this->secret('Kata sandi (min. 12 karakter)');
        if (mb_strlen($password) < 12) {
            $this->error('Kata sandi minimal 12 karakter.');

            return self::FAILURE;
        }
        if ($password !== (string) $this->secret('Ulangi kata sandi')) {
            $this->error('Kedua kata sandi tidak sama.');

            return self::FAILURE;
        }

        $existing = User::where('email', $email)->exists();
        User::firstOrNew(['email' => $email])->forceFill([
            'name' => $name,
            'whatsapp' => $this->option('whatsapp') ?: null,
            'password' => Hash::make($password),
            'role' => 'admin',
            'is_blocked' => false,
            'email_verified_at' => now(),
        ])->save();
        // Sandi lama mungkin bocor: keluarkan semua perangkat yang masih masuk dengan akun ini.
        \App\Services\Security\LoginSession::revokeAll(User::where('email', $email)->first());
        $this->info(($existing ? 'Akun diperbarui menjadi admin: ' : 'Admin dibuat: ') . $email);

        if (Category::count() === 0) {
            foreach (self::CATEGORIES as $cat) {
                Category::create(['name' => $cat, 'slug' => Str::slug($cat)]);
            }
            $this->info('Kategori dasar dibuat: ' . implode(', ', self::CATEGORIES) . '.');
        }

        return self::SUCCESS;
    }
}
