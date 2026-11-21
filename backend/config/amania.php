<?php

/*
 * Konfigurasi operasional Srawung (pemantauan kesehatan).
 * Semua nilai dapat diatur dari .env — lihat .env.production.example.
 */
return [

    'health' => [
        // Peringatan bila ruang disk tersisa di bawah persentase ini.
        'min_free_disk_percent' => (int) env('HEALTH_MIN_FREE_DISK_PERCENT', 10),

        // Email peringatan untuk masalah yang sama tidak diulang lebih cepat dari ini.
        'alert_cooldown_hours' => (int) env('HEALTH_ALERT_COOLDOWN_HOURS', 6),
    ],

];
