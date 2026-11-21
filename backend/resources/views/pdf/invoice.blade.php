@php
    $rp = fn ($n) => 'Rp ' . number_format((float) $n, 0, ',', '.');
    $tz = fn ($d) => $d ? $d->copy()->timezone('Asia/Jakarta')->locale('id')->translatedFormat('d F Y, H:i') . ' WIB' : '-';
    $statusLabel = [
        'menunggu_pembayaran' => 'Menunggu pembayaran',
        'menunggu_verifikasi' => 'Menunggu verifikasi',
        'dikonfirmasi' => 'Lunas',
        'ditolak' => 'Bukti ditolak',
        'kedaluwarsa' => 'Kedaluwarsa',
    ][$order->status] ?? $order->status;
@endphp
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>{{ $number }}</title>
<style>
    @page { margin: 36px 42px; }
    * { box-sizing: border-box; }
    body { font-family: 'DejaVu Sans', sans-serif; font-size: 10.5px; color: #334155; line-height: 1.5; }
    .brand { font-size: 22px; font-weight: bold; color: #0f4c3f; letter-spacing: -0.5px; }
    .brand span { color: #2fae7b; }
    .muted { color: #64748b; }
    .small { font-size: 9px; }
    h1 { font-size: 20px; margin: 0; color: #0f172a; letter-spacing: 1px; }
    table { width: 100%; border-collapse: collapse; }
    .head td { vertical-align: top; }
    .badge { display: inline-block; padding: 3px 10px; border-radius: 10px; font-size: 9.5px; font-weight: bold; }
    .paid { background: #d1fae5; color: #065f46; }
    .unpaid { background: #fef3c7; color: #92400e; }
    .void { background: #e2e8f0; color: #475569; }
    .box { border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; }
    .label { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #94a3b8; margin-bottom: 3px; }
    .items th { text-align: left; font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.6px; color: #64748b; border-bottom: 1.5px solid #cbd5e1; padding: 8px 6px; }
    .items td { border-bottom: 1px solid #f1f5f9; padding: 9px 6px; }
    .right, .items th.right { text-align: right; }
    .totals td { padding: 4px 6px; }
    .grand td { border-top: 1.5px solid #0f172a; padding-top: 8px; font-size: 13px; font-weight: bold; color: #0f172a; }
    .stamp { margin-top: 18px; border: 2px solid #059669; color: #059669; display: inline-block; padding: 6px 14px; border-radius: 6px; font-weight: bold; font-size: 12px; letter-spacing: 2px; }
    .footer { position: fixed; bottom: -10px; left: 0; right: 0; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 8.5px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
    <table class="head">
        <tr>
            <td style="width: 55%">
                <div class="brand">Srawung<span>.</span></div>
                <div class="muted small">Sinau Bareng, Berkarya Bareng · {{ $site }}</div>
                @if ($whatsapp)
                    <div class="muted small">WhatsApp: +{{ $whatsapp }}</div>
                @endif
            </td>
            <td class="right">
                <h1>INVOICE</h1>
                <div style="margin-top: 4px; font-weight: bold; color: #0f172a;">{{ $number }}</div>
                <div style="margin-top: 6px;">
                    <span class="badge {{ $paid ? 'paid' : (in_array($order->status, ['kedaluwarsa']) ? 'void' : 'unpaid') }}">{{ strtoupper($statusLabel) }}</span>
                </div>
            </td>
        </tr>
    </table>

    <table style="margin-top: 22px;">
        <tr>
            <td style="width: 50%; padding-right: 8px; vertical-align: top;">
                <div class="box">
                    <div class="label">Ditagihkan kepada</div>
                    <div style="font-weight: bold; color: #0f172a;">{{ $order->user?->name ?? '-' }}</div>
                    <div>{{ $order->user?->email }}</div>
                    @if ($order->user?->whatsapp)
                        <div>{{ $order->user->whatsapp }}</div>
                    @endif
                </div>
            </td>
            <td style="width: 50%; padding-left: 8px; vertical-align: top;">
                <div class="box">
                    <table>
                        <tr><td class="muted">No. pesanan</td><td class="right" style="color:#0f172a">{{ $order->order_number }}</td></tr>
                        <tr><td class="muted">Tanggal pesanan</td><td class="right">{{ $tz($order->created_at) }}</td></tr>
                        @if ($paid)
                            <tr><td class="muted">Tanggal lunas</td><td class="right">{{ $tz($order->confirmed_at) }}</td></tr>
                        @elseif (in_array($order->status, ['menunggu_pembayaran', 'ditolak']))
                            <tr><td class="muted">Batas pembayaran</td><td class="right">{{ $tz($order->payment_deadline) }}</td></tr>
                        @endif
                        <tr><td class="muted">Metode</td><td class="right">QRIS</td></tr>
                    </table>
                </div>
            </td>
        </tr>
    </table>

    <table class="items" style="margin-top: 22px;">
        <thead>
            <tr>
                <th style="width: 6%">No</th>
                <th>Buku digital</th>
                <th style="width: 10%" class="right">Qty</th>
                <th style="width: 22%" class="right">Harga</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($order->orderItems as $i => $item)
                <tr>
                    <td>{{ $i + 1 }}</td>
                    <td>
                        <div style="font-weight: bold; color: #0f172a;">{{ $item->book?->title ?? 'Buku (dihapus)' }}</div>
                        @if ($item->book?->author)
                            <div class="muted small">{{ $item->book->author }} · e-book, akses selamanya</div>
                        @endif
                    </td>
                    <td class="right">1</td>
                    <td class="right">{{ $rp($item->price) }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table style="margin-top: 10px;">
        <tr>
            <td style="width: 52%; vertical-align: top; padding-right: 16px;">
                @if (!$paid && in_array($order->status, ['menunggu_pembayaran', 'ditolak']))
                    <div class="box" style="background:#f8fafc">
                        <div class="label">Bayar dengan QRIS</div>
                        <table>
                            <tr>
                                @if ($qrisImage)
                                    <td style="width: 118px; vertical-align: top; padding-right: 10px;">
                                        <img src="{{ $qrisImage }}" style="width: 110px;" alt="QRIS">
                                    </td>
                                @endif
                                <td style="vertical-align: top;">
                                    Pindai QRIS <b>{{ $payment['merchant_name'] }}</b><br>
                                    <span class="muted small">NMID {{ $payment['nmid'] }}</span><br><br>
                                    Ketik nominal <b>tepat {{ $rp($order->total) }}</b><br>
                                    <span class="muted small">Lalu unggah bukti pembayaran di halaman pesanan Anda.</span>
                                </td>
                            </tr>
                        </table>
                    </div>
                @endif
            </td>
            <td style="width: 48%; vertical-align: top;">
                <table class="totals">
                    <tr><td class="muted">Subtotal</td><td class="right">{{ $rp($subtotal) }}</td></tr>
                    @if ($discount > 0)
                        <tr><td class="muted">Diskon{{ $order->coupon ? ' (' . $order->coupon->code . ')' : '' }}</td><td class="right" style="color:#047857">− {{ $rp($discount) }}</td></tr>
                    @endif
                    <tr class="grand"><td>Total</td><td class="right">{{ $rp($order->total) }}</td></tr>
                </table>
                @if ($paid)
                    <div style="text-align: right;"><span class="stamp">LUNAS</span></div>
                @endif
            </td>
        </tr>
    </table>

    <div class="footer">
        Invoice ini dibuat otomatis oleh sistem Srawung dan sah tanpa tanda tangan. · {{ $number }}
    </div>
</body>
</html>
