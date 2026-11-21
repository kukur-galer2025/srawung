'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Download } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, formatRupiah } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, Table, td, th } from '@/components/admin/ui';
import { Pagination } from '@/components/Pagination';

interface ReportOrder {
  id: number;
  order_number: string;
  total: number;
  confirmed_at: string;
  user?: { name: string; email: string } | null;
  order_items: { id: number; book: { title: string } | null }[];
}

interface Report {
  orders: { data: ReportOrder[]; last_page: number; total: number };
  summary: { total_revenue: number; total_orders: number; creator_share?: number; creator_commission?: number; amania_net?: number };
  sources?: { source: string; medium: string; orders: number; revenue: number; campaigns: Record<string, number> }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
// Tanggal kalender di zona perangkat (bukan UTC) — sebelum 07.00 WIB, toISOString() masih "kemarin".
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const PRESETS = [
  { label: '7 hari', days: 7 },
  { label: '30 hari', days: 30 },
  { label: 'Bulan ini', days: -1 },
  { label: 'Semua', days: 0 },
];

export default function AdminReportsPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const qs = new URLSearchParams({ page: String(page) });
  if (from) qs.set('date_from', from);
  if (to) qs.set('date_to', to);
  const { data, isLoading } = useSWR<Report>(`/admin/reports?${qs}`, (url: string) => api.get(url));
  const rows = data?.orders?.data ?? [];
  const summary = data?.summary;

  const applyPreset = (days: number) => {
    const now = new Date();
    if (days === 0) {
      setFrom('');
      setTo('');
    } else if (days === -1) {
      setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
      setTo(iso(now));
    } else {
      setFrom(iso(new Date(now.getTime() - (days - 1) * 86400000)));
      setTo(iso(now));
    }
    setPage(1);
  };

  // Ekspor CSV butuh header Authorization, jadi diunduh lewat fetch → blob.
  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set('date_from', from);
      if (to) params.set('date_to', to);
      const res = await fetch(`${API_URL}/admin/reports/export?${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('amania_token') ?? ''}` },
      });
      if (!res.ok) throw new Error('Gagal mengekspor laporan.');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `laporan-penjualan-${from || 'awal'}_${to || 'sekarang'}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengekspor laporan.');
    } finally {
      setExporting(false);
    }
  };

  const avg = summary && summary.total_orders ? Math.round(summary.total_revenue / summary.total_orders) : 0;

  return (
    <>
      <AdminHeader
        title="Laporan penjualan"
        description="Pesanan yang sudah dikonfirmasi, berdasarkan tanggal konfirmasi."
        actions={
          <Button variant="secondary" onClick={exportCsv} loading={exporting}>
            <Download className="h-4 w-4" />
            Ekspor CSV
          </Button>
        }
      />

      {error && <Notice tone="error">{error}</Notice>}

      <Panel className="mb-6 flex flex-col gap-4 p-4 lg:flex-row lg:items-end">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => applyPreset(p.days)} className="h-10 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50">
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3 lg:max-w-md lg:ml-auto">
          <Field label="Dari">
            <Input type="date" value={from} max={to || undefined} onChange={(e) => (setFrom(e.target.value), setPage(1))} />
          </Field>
          <Field label="Sampai">
            <Input type="date" value={to} min={from || undefined} onChange={(e) => (setTo(e.target.value), setPage(1))} />
          </Field>
        </div>
      </Panel>

      <div className={`mb-6 grid gap-4 sm:grid-cols-3 ${summary?.creator_share ? "xl:grid-cols-5" : ""}`}>
        {[
          { label: 'Total pendapatan', value: summary ? formatRupiah(summary.total_revenue) : '—' },
          { label: 'Pesanan dikonfirmasi', value: summary ? String(summary.total_orders) : '—' },
          { label: 'Rata-rata per pesanan', value: summary ? formatRupiah(avg) : '—' },
          ...(summary?.creator_share
            ? [
                { label: 'Bagian kreator', value: formatRupiah(summary.creator_share) },
                { label: 'Pendapatan bersih Srawung', value: formatRupiah(summary.amania_net ?? summary.total_revenue) },
              ]
            : []),
        ].map((s) => (
          <Panel key={s.label} className="p-5">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums text-slate-900">{s.value}</p>
          </Panel>
        ))}
      </div>

      <SearchInsights />

      <Panel className="mb-6 overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="font-sans text-base font-semibold text-slate-900">Sumber pesanan</h2>
          <p className="text-sm text-slate-500">
            Dari mana pembeli datang (UTM di tautan promosi, atau situs perujuk). Tambahkan <code className="rounded bg-slate-100 px-1 text-xs">?utm_source=instagram&amp;utm_campaign=nama-promo</code> di tautan yang Anda bagikan.
          </p>
        </div>
        {data?.sources?.length ? (
          <ul className="divide-y divide-slate-100">
            {data.sources.map((s) => {
              const share = summary && summary.total_revenue ? Math.round((s.revenue / summary.total_revenue) * 100) : 0;
              return (
                <li key={`${s.source}-${s.medium}`} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 sm:w-56">
                    <p className="font-semibold capitalize text-slate-900">{s.source}</p>
                    <p className="text-xs text-slate-500">
                      {s.medium}
                      {Object.keys(s.campaigns ?? {}).length ? ` · ${Object.keys(s.campaigns).join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-1 items-center gap-3">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full bg-blue-600" style={{ width: `${share}%` }} />
                    </span>
                    <span className="w-10 text-right text-xs tabular-nums text-slate-500">{share}%</span>
                  </div>
                  <div className="text-right text-sm sm:w-48">
                    <span className="font-semibold tabular-nums text-slate-900">{formatRupiah(s.revenue)}</span>
                    <span className="ml-2 text-xs text-slate-500">{s.orders} pesanan</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-slate-500">Belum ada data sumber pada periode ini.</p>
        )}
      </Panel>

      <Panel className="overflow-hidden">
        <Table
          colSpan={4}
          loading={isLoading}
          empty={!rows.length}
          head={
            <tr>
              <th className={th}>Pesanan</th>
              <th className={th}>Pembeli</th>
              <th className={th}>Buku</th>
              <th className={`${th} text-right`}>Total</th>
            </tr>
          }
        >
          {rows.map((o) => (
            <tr key={o.id} className="hover:bg-slate-50/60">
              <td className={td}>
                <p className="font-mono text-sm text-slate-900">{o.order_number}</p>
                <p className="text-xs text-slate-500">{formatDateTime(o.confirmed_at)}</p>
              </td>
              <td className={td}>
                <p className="font-medium text-slate-900">{o.user?.name ?? '—'}</p>
                <p className="text-xs text-slate-500">{o.user?.email}</p>
              </td>
              <td className={`${td} max-w-xs text-slate-600`}>
                <p className="line-clamp-2">{o.order_items.map((i) => i.book?.title ?? 'Buku dihapus').join(', ')}</p>
              </td>
              <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>{formatRupiah(o.total)}</td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Pagination currentPage={page} totalPages={data?.orders?.last_page ?? 1} onPageChange={setPage} />
    </>
  );
}

interface SearchRow {
  query: string;
  searches: number;
  results: number;
  last_searched_at: string | null;
}

interface SearchReport {
  days: number;
  total_searches: number;
  unique_queries: number;
  zero_rate: number;
  top: SearchRow[];
  zero: SearchRow[];
}

/** Apa yang dicari pembeli di katalog — terutama kata kunci yang tidak menemukan buku. */
function SearchInsights() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useSWR<SearchReport>(`/admin/reports/searches?days=${days}`, (url: string) => api.get(url));

  const list = (rows: SearchRow[] | undefined, zero: boolean) =>
    rows?.length ? (
      <ol className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <li key={r.query} className="flex items-center gap-3 px-5 py-2.5">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-slate-400">{i + 1}</span>
            <a
              href={`/buku?search=${encodeURIComponent(r.query)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 truncate font-medium text-slate-800 hover:text-blue-700 hover:underline"
              title={zero ? 'Lihat halaman hasil pencarian ini' : undefined}
            >
              {r.query}
            </a>
            {!zero && <span className="shrink-0 text-xs text-slate-400">{r.results} hasil</span>}
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${zero ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-700'}`}>
              {r.searches}×
            </span>
          </li>
        ))}
      </ol>
    ) : (
      <p className="px-5 py-6 text-sm text-slate-500">{isLoading ? 'Memuat…' : zero ? 'Semua pencarian menemukan buku. 🎉' : 'Belum ada pencarian pada periode ini.'}</p>
    );

  return (
    <Panel className="mb-6 overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-sans text-base font-semibold text-slate-900">Pencarian pembeli</h2>
          <p className="text-sm text-slate-500">
            {data
              ? `${data.total_searches} pencarian · ${data.unique_queries} kata kunci berbeda · ${data.zero_rate}% tidak menemukan buku`
              : 'Kata kunci yang diketik pengunjung di katalog.'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`h-9 rounded-xl px-3 text-sm font-medium transition ${days === d ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {d} hari
            </button>
          ))}
        </div>
      </div>
      <div className="grid divide-y divide-slate-100 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <section>
          <h3 className="px-5 pt-4 pb-1 text-sm font-semibold text-rose-700">Dicari tapi belum ada bukunya</h3>
          <p className="px-5 pb-2 text-xs text-slate-500">Peluang judul baru: pertimbangkan menerbitkan atau mengajak kreator menulisnya.</p>
          {list(data?.zero, true)}
        </section>
        <section>
          <h3 className="px-5 pt-4 pb-1 text-sm font-semibold text-slate-900">Paling sering dicari</h3>
          <p className="px-5 pb-2 text-xs text-slate-500">Cocok untuk ide banner, promo, atau kata kunci iklan.</p>
          {list(data?.top, false)}
        </section>
      </div>
    </Panel>
  );
}
