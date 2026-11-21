<?php

namespace App\Services;

use App\Models\User;

/**
 * Watermark forensik: kode pembaca yang nyaris tak terlihat, diulang di seluruh
 * halaman buku. Bila tangkapan layar bocor (walau watermark nama/email sudah
 * dipotong atau diedit), admin bisa menonjolkan kode ini lewat menu
 * "Lacak bocoran" lalu mencocokkannya dengan akun pembaca.
 *
 * Format kode: AM<ID>-<CEK>, mis. AM7K-Q3X. ID ditulis dalam basis-31 tanpa huruf
 * yang mudah tertukar (0/O, 1/I/L); CEK adalah HMAC 3 karakter dari APP_KEY
 * sehingga kode tidak bisa dikarang untuk menuduh akun lain.
 */
class ForensicMark
{
    private const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

    /** Persentase penggabungan teks ke halaman — cukup untuk dipulihkan, nyaris tak terlihat mata. */
    private const STRENGTH = 2;

    /** Pembesaran huruf bawaan GD (9×15 px) agar tetap terbaca setelah screenshot diperkecil. */
    private const SCALE = 3;

    public static function code(User|int $user): string
    {
        $id = $user instanceof User ? $user->id : $user;

        return 'AM' . self::encode($id) . '-' . self::check($id);
    }

    /**
     * Uraikan kode hasil bacaan admin. Mengembalikan ID pengguna dan apakah
     * kode cek cocok (false = kemungkinan salah baca / kode palsu).
     *
     * @return array{user_id: int, valid: bool}|null
     */
    public static function parse(string $code): ?array
    {
        $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code));
        if (!preg_match('/^AM([' . self::ALPHABET . ']+?)([' . self::ALPHABET . ']{3})$/', $code, $m)) {
            return null;
        }
        $id = self::decode($m[1]);
        if ($id < 1) {
            return null;
        }

        return ['user_id' => $id, 'valid' => hash_equals(self::check($id), $m[2])];
    }

    /** Cap kode berulang (pola bata) di seluruh halaman. */
    public static function apply(\GdImage $page, User $user): void
    {
        $text = self::code($user);
        $font = 5;
        $cw = imagefontwidth($font);
        $ch = imagefontheight($font);

        // Stempel kecil: teks hitam di atas latar transparan (palet → piksel latar dilewati saat digabung).
        $small = imagecreate($cw * strlen($text) + 2, $ch + 2);
        $bg = imagecolorallocate($small, 255, 255, 255);
        imagecolortransparent($small, $bg);
        imagestring($small, $font, 1, 1, $text, imagecolorallocate($small, 0, 0, 0));

        $w = imagesx($small) * self::SCALE;
        $h = imagesy($small) * self::SCALE;
        $stamp = imagecreate($w, $h);
        $bg2 = imagecolorallocate($stamp, 255, 255, 255);
        imagecolortransparent($stamp, $bg2);
        imagecolorallocate($stamp, 0, 0, 0);
        imagecopyresized($stamp, $small, 0, 0, 0, 0, $w, $h, imagesx($small), imagesy($small));
        imagecolortransparent($stamp, $bg2);

        $pw = imagesx($page);
        $ph = imagesy($page);
        $stepX = $w + (int) round($w * 0.6);
        $stepY = $h * 4;

        for ($row = 0, $y = (int) ($h * 0.8); $y < $ph; $row++, $y += $stepY) {
            $offset = $row % 2 ? (int) ($stepX / 2) : 0;
            for ($x = -$offset + 12; $x < $pw; $x += $stepX) {
                imagecopymerge($page, $stamp, $x, $y, 0, 0, $w, $h, self::STRENGTH);
            }
        }

        imagedestroy($small);
        imagedestroy($stamp);
    }

    private static function encode(int $n): string
    {
        $base = strlen(self::ALPHABET);
        $s = '';
        do {
            $s = self::ALPHABET[$n % $base] . $s;
            $n = intdiv($n, $base);
        } while ($n > 0);

        return $s;
    }

    private static function decode(string $s): int
    {
        $base = strlen(self::ALPHABET);
        $n = 0;
        foreach (str_split($s) as $c) {
            $p = strpos(self::ALPHABET, $c);
            if ($p === false || $n > intdiv(PHP_INT_MAX - $p, $base)) {
                return 0;
            }
            $n = $n * $base + $p;
        }

        return $n;
    }

    private static function check(int $id): string
    {
        $hash = hash_hmac('sha256', "forensic:{$id}", (string) config('app.key'), true);
        $base = strlen(self::ALPHABET);
        $out = '';
        for ($i = 0; $i < 3; $i++) {
            $out .= self::ALPHABET[ord($hash[$i]) % $base];
        }

        return $out;
    }
}
