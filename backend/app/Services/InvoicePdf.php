<?php

namespace App\Services;

use App\Models\Order;
use App\Models\Setting;
use Barryvdh\DomPDF\Facade\Pdf;

/**
 * Membuat invoice PDF untuk sebuah pesanan.
 */
class InvoicePdf
{
    public static function number(Order $order): string
    {
        return 'INV/' . $order->created_at->timezone('Asia/Jakarta')->format('Y/m') . '/' . str_pad((string) $order->id, 6, '0', STR_PAD_LEFT);
    }

    public static function filename(Order $order): string
    {
        return 'Invoice-' . $order->order_number . '.pdf';
    }

    public static function render(Order $order): string
    {
        $order->loadMissing(['orderItems.book', 'user', 'coupon']);

        $subtotal = (int) $order->orderItems->sum('price');
        $discount = max(0, $subtotal - (int) $order->total);

        return Pdf::loadView('pdf.invoice', [
            'order' => $order,
            'number' => self::number($order),
            'subtotal' => $subtotal,
            'discount' => $discount,
            'paid' => $order->status === 'dikonfirmasi',
            'payment' => PaymentInfo::get(),
            'qrisImage' => PaymentInfo::pdfImagePath(),
            'whatsapp' => Setting::get('whatsapp_admin'),
            'site' => parse_url(config('app.frontend_url'), PHP_URL_HOST),
        ])->setPaper('a4')->output();
    }
}
