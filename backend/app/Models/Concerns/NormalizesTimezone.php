<?php

namespace App\Models\Concerns;

/**
 * Simpan semua tanggal dalam zona waktu aplikasi (Asia/Jakarta).
 *
 * Bawaan Laravel menyimpan "jam dinding" dari nilai apa adanya: string ISO dari
 * frontend seperti "2026-12-01T03:00:00.000Z" (UTC) akan tersimpan sebagai 03.00,
 * padahal maksudnya 10.00 WIB. Trait ini mengonversinya dulu ke zona aplikasi.
 */
trait NormalizesTimezone
{
    public function fromDateTime($value)
    {
        return empty($value)
            ? $value
            : $this->asDateTime($value)->setTimezone(config('app.timezone'))->format($this->getDateFormat());
    }
}
