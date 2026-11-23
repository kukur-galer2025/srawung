'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Users, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, formatRupiah } from '@/lib/utils';
import { AdminHeader, Panel } from '@/components/admin/ui';
import { BookCover, resolveCover } from '@/components/BookCard';
import { Skeleton } from '@/components/LoadingSkeleton';

interface Dashboard {
  pending_orders_count: number;
  confirmed_today_count: number;
  revenue_this_month: number;
  total_books_count: number;
  total_users_count: number;
  top_books: { id: number; title: string; author: string; cover_url: string | null; sales_count: number }[];
  chart_data: { date: string; label: string; revenue: number; orders_count: number }[];
}

interface PendingOrder {
  id: number;
  order_number: string;
  total: number;
  created_at: string;
  user?: { name: string; email: string } | null;
}

const compactRupiah = (n: number) =>
  n >= 1_000_000 ? `Rp ${(n / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt` : n >= 1000 ? `Rp ${Math.round(n / 1000)} rb` : `Rp ${n}`;

function StatTile({ icon: Icon, label, value, hint, href, highlight }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string; href?: string; highlight?: boolean }) {
  const body = (
    <Panel className={`h-full p-4 transition sm:p-5 ${href ? 'hover:border-slate-300 hover:shadow-md' : ''} ${highlight ? 'ring-2 ring-amber-300' : ''}`}>
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium leading-snug text-slate-500 sm:text-sm">{label}</p>
        <Icon className="h-[18px] w-[18px] text-slate-400" />
      </div>
      <p className="mt-2 whitespace-nowrap text-lg font-bold tracking-tight text-slate-900 tabular-nums sm:mt-3 sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Panel>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function RevenueChart({ data }: { data: Dashboard['chart_data'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.revenue));
  const total = data.reduce((s, d) => s + d.revenue, 0);
  const orders = data.reduce((s, d) => s + d.orders_count, 0);
  const ticks = [max, max / 2, 0];
  const H = 200;

  return (
    <Panel className="p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Pendapatan 30 hari terakhir</h2>
          <p className="mt-1 text-sm text-slate-500">Dari pesanan yang sudah dikonfirmasi</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">{formatRupiah(total)}</p>
          <p className="text-xs text-slate-500">{orders} pesanan</p>
        </div>
      </div>

      <div className="flex gap-3">
        {/* Sumbu Y */}
        <div className="flex w-14 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-slate-400" style={{ height: H }}>
          {ticks.map((t, i) => (
            <span key={i} className="-translate-y-1/2 first:translate-y-0 last:translate-y-0">
              {compactRupiah(t)}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* Grid */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: H }}>
            {ticks.map((_, i) => (
              <span key={i} className={`h-px w-full ${i === ticks.length - 1 ? 'bg-slate-300' : 'bg-slate-100'}`} />
            ))}
          </div>

          {/* Batang */}
          <div className="relative flex items-end gap-[2px]" style={{ height: H }} role="img" aria-label={`Grafik pendapatan harian, total ${formatRupiah(total)}`}>
            {data.map((d, i) => {
              const h = d.revenue > 0 ? Math.max(4, (d.revenue / max) * H) : 0;
              return (
                <div
                  key={d.date}
                  className="relative flex h-full flex-1 items-end"
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  aria-label={`${d.label}: ${formatRupiah(d.revenue)}, ${d.orders_count} pesanan`}
                >
                  <div
                    className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-blue-700' : 'bg-blue-500'}`}
                    style={{ height: h }}
                  />
                  {hover === i && (
                    <div
                      className={`pointer-events-none absolute bottom-full z-10 mb-2 w-max rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-lg ${
                        i > data.length * 0.7 ? 'right-0' : i < data.length * 0.3 ? 'left-0' : 'left-1/2 -translate-x-1/2'
                      }`}
                    >
                      <p className="font-semibold">{d.label}</p>
                      <p className="mt-0.5 tabular-nums text-slate-300">{formatRupiah(d.revenue)}</p>
                      <p className="tabular-nums text-slate-400">{d.orders_count} pesanan</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sumbu X */}
          <div className="mt-2 flex justify-between text-[11px] text-slate-400">
            <span>{data[0]?.label}</span>
            <span>{data[Math.floor(data.length / 2)]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </div>
      </div>

      {/* Tabel untuk pembaca layar */}
      <table className="sr-only">
        <caption>Pendapatan harian</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th>{d.label}</th>
              <td>{formatRupiah(d.revenue)}</td>
              <td>{d.orders_count} pesanan</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

export default function AdminDashboardPage() {
  const { data, isLoading, error } = useSWR<Dashboard>('/admin/dashboard', (url: string) => api.get(url));
  const { data: pending } = useSWR<{ data: PendingOrder[]; total: number }>('/admin/orders?status=menunggu_verifikasi', (url: string) => api.get(url));

  const today = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

  return (
    <>
      <AdminHeader title="Ringkasan" description={today} />

      {error && <Panel className="mb-6 p-4 text-sm text-rose-700">Gagal memuat data dashboard.</Panel>}

      <div className="dash-stats mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {isLoading || !data ? (
          Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)
        ) : (
          <>
            <StatTile
              icon={ClipboardCheck}
              label="Perlu diverifikasi"
              value={String(pending?.total ?? 0)}
              hint={`${data.pending_orders_count} pesanan belum selesai`}
              href="/admin/pesanan"
              highlight={(pending?.total ?? 0) > 0}
            />
            <StatTile icon={CheckCircle2} label="Dikonfirmasi hari ini" value={String(data.confirmed_today_count)} />
            <StatTile icon={Wallet} label="Pendapatan bulan ini" value={formatRupiah(data.revenue_this_month)} href="/admin/laporan" />
            <StatTile icon={BookOpen} label="Total buku" value={String(data.total_books_count)} href="/admin/buku" />
            <StatTile icon={Users} label="Pembeli terdaftar" value={String(data.total_users_count)} href="/admin/pengguna" />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        {data ? <RevenueChart data={data.chart_data} /> : <Skeleton className="h-80 rounded-2xl" />}

        <Panel className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900">Menunggu verifikasi</h2>
            <Link href="/admin/pesanan" className="flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">
              Semua <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          {pending?.data?.length ? (
            <ul className="divide-y divide-slate-100">
              {pending.data.slice(0, 6).map((o) => (
                <li key={o.id}>
                  <Link href={`/admin/pesanan?order=${o.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{o.user?.name ?? 'Pembeli'}</p>
                      <p className="truncate font-mono text-xs text-slate-500">{o.order_number}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-slate-900">{formatRupiah(o.total)}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(o.created_at)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-10 text-center text-sm text-slate-400">Tidak ada pesanan yang menunggu. 🎉</p>
          )}
        </Panel>
      </div>

      <Panel className="mt-6 p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Buku terlaris</h2>
        {data?.top_books?.length ? (
          <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {data.top_books.map((b, i) => (
              <li key={b.id} className="flex items-center gap-3">
                <span className="w-5 text-sm font-bold text-slate-400">{i + 1}</span>
                <span className="relative aspect-[3/4.3] w-10 shrink-0 overflow-hidden rounded ring-1 ring-slate-900/5">
                  <BookCover title={b.title} src={resolveCover(b.cover_url)} />
                </span>
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{b.title}</p>
                  <p className="text-xs text-slate-500">{b.sales_count} terjual</p>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-400">Belum ada penjualan yang dikonfirmasi.</p>
        )}
      </Panel>
    </>
  );
}
