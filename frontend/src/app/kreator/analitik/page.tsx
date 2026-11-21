'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle2, Info, Lightbulb, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { formatRupiah } from '@/lib/utils';
import { AdminHeader, Panel, PanelHeader } from '@/components/admin/ui';
import { BookCover } from '@/components/BookCard';

interface FunnelStep {
  key: 'views' | 'carts' | 'checkouts' | 'sold';
  label: string;
  value: number;
}

interface BookRow {
  id: number;
  title: string;
  slug: string;
  status: string;
  cover_url: string | null;
  views: number;
  carts: number;
  checkouts: number;
  sold: number;
  net: number;
  conversion: number | null;
  insight: { tone: 'info' | 'warning' | 'success'; text: string } | null;
}

interface Analytics {
  days: number;
  funnel: FunnelStep[];
  net: number;
  books: BookRow[];
}

const STEP_HINT: Record<FunnelStep['key'], string> = {
  views: 'Kunjungan ke halaman buku Anda',
  carts: 'Pengunjung yang menambahkan buku ke keranjang',
  checkouts: 'Pesanan yang dibuat (dibayar maupun belum)',
  sold: 'Penjualan terkonfirmasi (tidak termasuk refund)',
};

const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 1000) / 10}%` : '—');

export default function CreatorAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useSWR<Analytics>(`/creator/analytics?days=${days}`, (url: string) => api.get(url));

  return (
    <>
      <AdminHeader
        title="Analitik"
        description="Dari mana pembeli hilang: dilihat → masuk keranjang → checkout → dibeli. Gunakan saran di tiap buku untuk memperbaiki tahap yang paling bocor."
        actions={
          <div className="flex gap-1.5" role="group" aria-label="Periode">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                aria-pressed={days === d}
                className={`h-9 rounded-xl px-3 text-sm font-medium transition ${days === d ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {d} hari
              </button>
            ))}
          </div>
        }
      />

      <Panel className="mb-6">
        <PanelHeader title="Alur pembeli" description={data ? `${days} hari terakhir · pendapatan ${formatRupiah(data.net)}` : 'Memuat…'} />
        <div className="p-5">{data ? <Funnel steps={data.funnel} /> : <div className="h-40 animate-pulse rounded-xl bg-slate-50" />}</div>
      </Panel>

      <h2 className="mb-3 text-base font-semibold text-slate-900">Per buku</h2>
      {isLoading ? (
        <Panel className="h-40 animate-pulse">{null}</Panel>
      ) : !data?.books.length ? (
        <Panel className="p-8 text-center text-sm text-slate-500">
          Belum ada buku.{' '}
          <Link href="/kreator/buku" className="font-semibold text-blue-700 hover:underline">
            Terbitkan buku pertama Anda
          </Link>
          .
        </Panel>
      ) : (
        <ul className="space-y-3">
          {data.books.map((b) => (
            <li key={b.id}>
              <BookStats book={b} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Funnel horizontal satu warna: panjang batang ∝ jumlah, label langsung + persentase lolos dari tahap sebelumnya. */
function Funnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, steps[0]?.value ?? 0);
  return (
    <ol className="space-y-4">
      {steps.map((s, i) => {
        const prev = i > 0 ? steps[i - 1].value : null;
        const width = s.value > 0 ? Math.max(1.5, (s.value / max) * 100) : 0;
        return (
          <li key={s.key} title={`${s.label}: ${s.value.toLocaleString('id-ID')}${prev !== null ? ` (${pct(s.value, prev)} dari tahap sebelumnya)` : ''}`}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="font-medium text-slate-900">{s.label}</span>
                <span className="ml-2 hidden text-xs text-slate-400 sm:inline">{STEP_HINT[s.key]}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                <span className="font-semibold text-slate-900">{s.value.toLocaleString('id-ID')}</span>
                {prev !== null && <span className="ml-2 text-xs text-slate-500">{pct(s.value, prev)} lolos</span>}
              </span>
            </div>
            <div className="h-3 rounded-full bg-slate-100">
              <div className="h-3 rounded-[4px] bg-violet-600 transition-[width] duration-500" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const TONE = {
  info: { icon: Info, cls: 'bg-slate-50 text-slate-700' },
  warning: { icon: TriangleAlert, cls: 'bg-amber-50 text-amber-900' },
  success: { icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-900' },
};

function BookStats({ book: b }: { book: BookRow }) {
  const cells = [
    { label: 'Dilihat', value: b.views.toLocaleString('id-ID') },
    { label: 'Keranjang', value: b.carts.toLocaleString('id-ID'), sub: pct(b.carts, b.views) },
    { label: 'Checkout', value: b.checkouts.toLocaleString('id-ID'), sub: pct(b.checkouts, b.carts) },
    { label: 'Dibeli', value: b.sold.toLocaleString('id-ID'), sub: pct(b.sold, b.checkouts) },
  ];
  const tone = b.insight ? TONE[b.insight.tone] : null;
  const ToneIcon = tone?.icon ?? Lightbulb;

  return (
    <Panel className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-3 lg:w-72 lg:shrink-0">
          <span className="relative aspect-[3/4.3] w-11 shrink-0 overflow-hidden rounded-md shadow ring-1 ring-slate-900/5">
            <BookCover title={b.title} src={b.cover_url} sizes="48px" />
          </span>
          <div className="min-w-0">
            <Link href={`/buku/${b.slug}`} target="_blank" className="line-clamp-2 text-sm font-semibold text-slate-900 hover:text-blue-700">
              {b.title}
            </Link>
            <p className="mt-0.5 text-xs text-slate-500">
              {b.status === 'published' ? 'Terbit' : 'Draf'} · konversi {b.conversion !== null ? `${b.conversion}%` : '—'} · {formatRupiah(b.net)}
            </p>
          </div>
        </div>
        <dl className="grid flex-1 grid-cols-4 gap-2">
          {cells.map((c) => (
            <div key={c.label} className="min-w-0 rounded-lg bg-slate-50 px-2.5 py-2">
              <dt className="truncate text-[11px] text-slate-500">{c.label}</dt>
              <dd className="text-base font-semibold tabular-nums text-slate-900">{c.value}</dd>
              {c.sub && <dd className="text-[11px] tabular-nums text-slate-400">{c.sub}</dd>}
            </div>
          ))}
        </dl>
      </div>
      {b.insight && tone && (
        <p className={`mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${tone.cls}`}>
          <ToneIcon className="mt-0.5 h-4 w-4 shrink-0" />
          {b.insight.text}
        </p>
      )}
    </Panel>
  );
}
