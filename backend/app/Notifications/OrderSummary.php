<?php

namespace App\Notifications;

use App\Models\Order;
use Illuminate\Support\HtmlString;

/**
 * Tabel ringkasan pesanan (judul buku + harga + total) dalam format markdown,
 * sehingga tampil rapi di versi HTML maupun versi plain-text email.
 *
 * Dibungkus HtmlString karena MailMessage::line() menggabungkan baris biasa
 * menjadi satu baris (merusak tabel markdown). Konsekuensinya teks tidak
 * di-escape otomatis, jadi judul buku di-escape manual dengan e().
 */
trait OrderSummary
{
    protected function orderTable(Order $order): HtmlString
    {
        $cell = fn (string $v) => e(str_replace(['|', "\r", "\n"], ['/', ' ', ' '], $v));

        $lines = ['| Buku | Harga |', '|:-----|-----:|'];
        $order->loadMissing('orderItems.bundle');
        foreach ($order->orderItems as $item) {
            $title = ($item->book->title ?? 'Buku') . ($item->bundle ? ' (paket ' . $item->bundle->title . ')' : '');
            $lines[] = '| ' . $cell($title) . ' | ' . $this->rupiah($item->price) . ' |';
        }
        $order->loadMissing('orderItems');
        $discount = (int) $order->orderItems->sum('discount');
        if ($discount > 0) {
            $lines[] = '| Diskon kupon | −' . $this->rupiah($discount) . ' |';
        }
        $lines[] = '| **Total** | **' . $this->rupiah($order->total) . '** |';

        // Baris kosong di sekitar tabel wajib: CommonMark hanya mem-parse markdown
        // di antara blok HTML <div> jika dipisah baris kosong (pola x-mail::table).
        return new HtmlString("<div class=\"table\">\n\n" . implode("\n", $lines) . "\n\n</div>");
    }
}
