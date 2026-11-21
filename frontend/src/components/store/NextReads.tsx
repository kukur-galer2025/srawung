'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, BookOpen, Sparkles, TrendingUp, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { BookSummary } from '@/lib/types';
import { formatRupiah } from '@/lib/utils';
import { BookCover } from '@/components/BookCard';

export interface NextRead extends BookSummary {
  kind: 'series' | 'readers' | 'similar';
  reason: string;
  percent: number | null;
  is_owned: boolean;
}

const KIND_ICON = { series: BookOpen, readers: TrendingUp, similar: Sparkles };

export function useNextReads(slug: string) {
  return useSWR<NextRead[]>(`/books/${slug}/next`, (url: string) => api.get(url));
}

/** Bagian di halaman buku: "Setelah buku ini, pembaca biasanya lanjut ke…" */
export function NextReadsSection({ slug }: { slug: string }) {
  const { data } = useNextReads(slug);
  if (!data?.length) return null;
  const fromReaders = data.some((d) => d.kind === 'readers');

  return (
    <section className="reveal mt-16">
      <p className="eyebrow mb-2">Jalur belajar</p>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        Setelah buku ini, {fromReaders ? <em className="text-navy">pembaca biasanya lanjut ke…</em> : <em className="text-navy">lanjutkan dengan…</em>}
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {data.map((b, i) => {
          const Icon = KIND_ICON[b.kind];
          return (
            <Link
              key={b.id}
              href={b.is_owned ? `/baca/${b.slug}` : `/buku/${b.slug}`}
              className="reveal-item group flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition duration-500 ease-luxe hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_20px_40px_-28px_rgba(15,76,63,0.5)]"
              style={{ ['--i' as string]: i }}
            >
              <span className="relative aspect-[3/4.3] w-20 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-900/5">
                <BookCover title={b.title} srcSet={b.cover_srcset} placeholder={b.cover_placeholder} src={b.cover_url} sizes="96px" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.kind === 'series' ? 'bg-blue-50 text-blue-700' : b.kind === 'readers' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                  <Icon className="h-3 w-3" />
                  {b.reason}
                </span>
                <span className="mt-2 line-clamp-2 font-display font-semibold leading-snug text-slate-900 group-hover:text-blue-700">{b.title}</span>
                <span className="mt-auto flex items-center justify-between pt-2 text-sm">
                  {b.is_owned ? (
                    <span className="font-semibold text-emerald-700">Sudah Anda miliki</span>
                  ) : (
                    <span className="font-semibold text-slate-900">{formatRupiah(b.effective_price ?? b.price)}</span>
                  )}
                  <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Kartu kecil di reader saat pembaca sampai di halaman terakhir. */
export function NextReadCard({ slug }: { slug: string }) {
  const { data } = useNextReads(slug);
  const [closed, setClosed] = useState(false);
  const next = data?.[0];
  if (!next || closed) return null;

  return (
    <div className="modal-panel fixed bottom-20 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl">
      <button onClick={() => setClosed(true)} aria-label="Tutup" className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 hover:bg-slate-100">
        <X className="h-4 w-4" />
      </button>
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-orange">Selesai! Lanjut ke berikutnya</p>
      <div className="mt-3 flex gap-3">
        <span className="relative aspect-[3/4.3] w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-slate-900/5">
          <BookCover title={next.title} srcSet={next.cover_srcset} placeholder={next.cover_placeholder} src={next.cover_url} sizes="64px" />
        </span>
        <div className="min-w-0">
          <p className="line-clamp-2 font-semibold leading-snug">{next.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{next.reason}</p>
        </div>
      </div>
      <Link
        href={next.is_owned ? `/baca/${next.slug}` : `/buku/${next.slug}`}
        className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-blue-700 text-sm font-semibold text-white transition hover:bg-blue-800"
      >
        {next.is_owned ? 'Baca sekarang' : `Lihat buku · ${formatRupiah(next.effective_price ?? next.price)}`}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
