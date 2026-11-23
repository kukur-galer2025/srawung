<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Order;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ReportController extends Controller
{
    public function index(Request $request)
    {
        $query = Order::with(['user', 'orderItems.book'])
            ->where('status', 'dikonfirmasi');

        if ($request->filled('date_from')) {
            $query->whereDate('confirmed_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('confirmed_at', '<=', $request->date_to);
        }

        $totalRevenue = (clone $query)->sum('total');
        // Bagian kreator (saldo yang menjadi hak kreator) & komisi Srawung dari buku kreator.
        $creator = \App\Models\CreatorEarning::whereIn('order_id', (clone $query)->select('id'))
            ->selectRaw('COALESCE(SUM(net),0) net, COALESCE(SUM(commission),0) commission')->first();
        $sources = self::sourceBreakdown((clone $query)->get(['utm_source', 'utm_medium', 'utm_campaign', 'referrer', 'total']));
        $orders = $query->latest('confirmed_at')->paginate(20);

        return response()->json([
            'orders' => $orders,
            'summary' => [
                'total_revenue' => (int) $totalRevenue,
                'total_orders' => $orders->total(),
                'creator_share' => (int) $creator->net,
                'creator_commission' => (int) $creator->commission,
                'amania_net' => (int) $totalRevenue - (int) $creator->net,
            ],
            'sources' => $sources,
        ]);
    }

    /** Label sumber satu pesanan: UTM source → domain referrer → "langsung". */
    public static function sourceOf(Order $o): string
    {
        return $o->utm_source ?: ($o->referrer ?: 'langsung');
    }

    /** Rekap pesanan & pendapatan per sumber (urut pendapatan terbesar). */
    public static function sourceBreakdown($orders): array
    {
        return collect($orders)
            ->groupBy(fn (Order $o) => self::sourceOf($o) . '|' . ($o->utm_medium ?: ($o->utm_source ? '-' : ($o->referrer ? 'referral' : 'langsung'))))
            ->map(function ($group, $key) {
                [$source, $medium] = explode('|', $key);

                return [
                    'source' => $source,
                    'medium' => $medium,
                    'orders' => $group->count(),
                    'revenue' => (int) $group->sum('total'),
                    'campaigns' => $group->pluck('utm_campaign')->filter()->countBy()->sortDesc()->take(3),
                ];
            })
            ->sortByDesc('revenue')
            ->values()
            ->all();
    }

    /**
     * Apa yang dicari pembeli di katalog: kata kunci terpopuler & yang tidak menemukan buku
     * (sinyal judul yang perlu ditambahkan).
     */
    public function searches(Request $request)
    {
        $days = in_array((int) $request->query('days'), [7, 30, 90], true) ? (int) $request->query('days') : 30;
        $since = now()->subDays($days - 1)->toDateString();
        $base = \Illuminate\Support\Facades\DB::table('search_query_daily')->where('date', '>=', $since);

        $total = (int) (clone $base)->sum('searches');
        $grouped = (clone $base)->groupBy('query')
            ->selectRaw('query, SUM(searches) as searches, MAX(results) as results, MAX(last_searched_at) as last_searched_at');

        $top = (clone $grouped)->havingRaw('MAX(results) > 0')->orderByDesc('searches')->orderBy('query')->limit(15)->get();
        $zero = (clone $grouped)->havingRaw('MAX(results) = 0')->orderByDesc('searches')->orderByDesc('last_searched_at')->limit(15)->get();
        $zeroTotal = (int) \Illuminate\Support\Facades\DB::query()->fromSub((clone $grouped)->havingRaw('MAX(results) = 0'), 'z')->sum('searches');

        $cast = fn ($r) => ['query' => $r->query, 'searches' => (int) $r->searches, 'results' => (int) $r->results, 'last_searched_at' => $r->last_searched_at];

        return response()->json([
            'days' => $days,
            'total_searches' => $total,
            'unique_queries' => (int) \Illuminate\Support\Facades\DB::query()->fromSub(clone $grouped, 'g')->count(),
            'zero_rate' => $total ? round($zeroTotal / $total * 100) : 0,
            'top' => $top->map($cast)->values(),
            'zero' => $zero->map($cast)->values(),
        ]);
    }

    /** Sel yang diawali = + - @ dianggap rumus oleh Excel; tanda petik membuatnya tetap teks biasa. */
    private static function csvSafe(mixed $value): mixed
    {
        return is_string($value) && preg_match('/^[=+\-@\t\r]/', $value) && $value !== '-' ? "'" . $value : $value;
    }

    public function export(Request $request)
    {
        $query = Order::with(['user', 'orderItems.book'])
            ->where('status', 'dikonfirmasi');

        if ($request->filled('date_from')) {
            $query->whereDate('confirmed_at', '>=', $request->date_from);
        }

        if ($request->filled('date_to')) {
            $query->whereDate('confirmed_at', '<=', $request->date_to);
        }

        $orders = $query->latest('confirmed_at')->get();

        $response = new StreamedResponse(function () use ($orders) {
            $handle = fopen('php://output', 'w');

            // Header CSV
            fputcsv($handle, [
                'Nomor Pesanan',
                'Tanggal Konfirmasi',
                'Nama Pembeli',
                'Email Pembeli',
                'WhatsApp Pembeli',
                'Daftar Buku',
                'Total Pembayaran (Rp)',
                'Status',
                'Sumber',
                'Medium',
                'Kampanye',
            ]);

            foreach ($orders as $order) {
                $bookTitles = $order->orderItems->map(fn($item) => $item->book?->title ?: 'Buku tidak ditemukan')->implode('; ');

                fputcsv($handle, array_map(self::csvSafe(...), [
                    $order->order_number,
                    $order->confirmed_at ? $order->confirmed_at->format('Y-m-d H:i:s') : '-',
                    $order->user?->name ?: '-',
                    $order->user?->email ?: '-',
                    $order->user?->whatsapp ?: '-',
                    $bookTitles,
                    $order->total,
                    $order->status,
                    self::sourceOf($order),
                    $order->utm_medium ?: '-',
                    $order->utm_campaign ?: '-',
                ]));
            }

            fclose($handle);
        });

        $fileName = 'laporan-penjualan-' . date('Ymd_His') . '.csv';

        $response->headers->set('Content-Type', 'text/csv; charset=UTF-8');
        $response->headers->set('Content-Disposition', 'attachment; filename="' . $fileName . '"');
        $response->headers->set('Pragma', 'no-cache');
        $response->headers->set('Expires', '0');

        return $response;
    }
}
