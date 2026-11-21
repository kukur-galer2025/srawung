<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\Book;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class DashboardController extends Controller
{
    public function index()
    {
        $today = Carbon::today();
        $startOfMonth = Carbon::now()->startOfMonth();

        $pendingOrdersCount = Order::whereIn('status', ['menunggu_pembayaran', 'menunggu_verifikasi'])->count();
        $confirmedTodayCount = Order::where('status', 'dikonfirmasi')
            ->whereDate('confirmed_at', $today)
            ->count();

        $revenueThisMonth = (int) Order::where('status', 'dikonfirmasi')
            ->where('confirmed_at', '>=', $startOfMonth)
            ->sum('total');

        $totalBooksCount = Book::count();
        $totalUsersCount = User::where('role', 'buyer')->count();

        // Top 5 buku terlaris
        $topBooks = Book::select('books.id', 'books.title', 'books.author', 'books.price', 'books.cover_path', DB::raw('COUNT(order_items.id) as sales_count'))
            ->join('order_items', 'books.id', '=', 'order_items.book_id')
            ->join('orders', 'order_items.order_id', '=', 'orders.id')
            ->where('orders.status', 'dikonfirmasi')
            ->groupBy('books.id', 'books.title', 'books.author', 'books.price', 'books.cover_path')
            ->orderByDesc('sales_count')
            ->limit(5)
            ->get();

        // Chart data 30 hari terakhir
        $chartData = [];
        for ($i = 29; $i >= 0; $i--) {
            $date = Carbon::today()->subDays($i);
            $dateString = $date->format('Y-m-d');
            $chartData[$dateString] = [
                'date' => $dateString,
                'label' => $date->format('d M'),
                'revenue' => 0,
                'orders_count' => 0,
            ];
        }

        $dailyStats = Order::where('status', 'dikonfirmasi')
            ->where('confirmed_at', '>=', Carbon::today()->subDays(29)->startOfDay())
            ->groupBy(DB::raw('DATE(confirmed_at)'))
            ->select(
                DB::raw('DATE(confirmed_at) as date'),
                DB::raw('SUM(total) as daily_revenue'),
                DB::raw('COUNT(id) as count')
            )
            ->get();

        foreach ($dailyStats as $stat) {
            if (isset($chartData[$stat->date])) {
                $chartData[$stat->date]['revenue'] = (int) $stat->daily_revenue;
                $chartData[$stat->date]['orders_count'] = (int) $stat->count;
            }
        }

        return response()->json([
            'pending_orders_count' => $pendingOrdersCount,
            'confirmed_today_count' => $confirmedTodayCount,
            'revenue_this_month' => $revenueThisMonth,
            'total_books_count' => $totalBooksCount,
            'total_users_count' => $totalUsersCount,
            'top_books' => $topBooks,
            'chart_data' => array_values($chartData),
        ]);
    }
}
