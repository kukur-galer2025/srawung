<?php

/*
 * Konfigurasi operasional Srawung (pemantauan kesehatan).
 * Semua nilai dapat diatur dari .env — lihat .env.production.example.
 */
return [

    'security' => [
        // Masa berlaku login (jam) per peran. Admin paling pendek karena paling berharga bagi penyerang.
        'token_hours' => [
            'admin' => (int) env('ADMIN_TOKEN_HOURS', 12),
            'creator' => (int) env('CREATOR_TOKEN_HOURS', 24 * 7),
            'buyer' => (int) env('BUYER_TOKEN_HOURS', 24 * 30),
        ],

        // IP server frontend (Next.js) — permintaan halaman dari server tidak dibatasi sebagai satu pengunjung.
        'ssr_ips' => array_values(array_filter(array_map('trim', explode(',', (string) env('SSR_IPS', '127.0.0.1,::1'))))),

        // Jeda penarikan setelah rekening pencairan kreator diganti (jam).
        'payout_cooldown_hours' => (int) env('PAYOUT_COOLDOWN_HOURS', 24),
    ],

    'health' => [
        // Peringatan bila ruang disk tersisa di bawah persentase ini.
        'min_free_disk_percent' => (int) env('HEALTH_MIN_FREE_DISK_PERCENT', 10),

        // Email peringatan untuk masalah yang sama tidak diulang lebih cepat dari ini.
        'alert_cooldown_hours' => (int) env('HEALTH_ALERT_COOLDOWN_HOURS', 6),
    ],

];
