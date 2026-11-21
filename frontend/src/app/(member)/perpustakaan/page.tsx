'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, BookOpen, Library, Play, RotateCcw } from 'lucide-react';
import { api } from '@/lib/api';
import { EmptyState } from '@/components/EmptyState';
import { BookCardSkeleton } from '@/components/LoadingSkeleton';
import { BookCover } from '@/components/BookCard';
import { PageHeader } from '@/components/PageHeader';

interface OwnedBook {
  id: number;
  book_id: number;
  last_read_page: number;
  updated_at: string;
  book: { id: number; title: string; slug: string; author: string; cover_url: string | null; total_pages: number } | null;
}

type Filter = 'all' | 'reading' | 'unread' | 'done';

function progress(item: OwnedBook) {
  const total = Math.max(1, item.book?.total_pages || 1);
  const page = Math.max(1, item.last_read_page || 1);
  return { page, total, pct: Math.min(100, Math.round((page / total) * 100)) };
}

function status(item: OwnedBook): Exclude<Filter, 'all'> {
  const { page, pct } = progress(item);
  if (pct >= 100) return 'done';
  return page <= 1 ? 'unread' : 'reading';
}

export default function LibraryPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const { data, isLoading } = useSWR<OwnedBook[]>('/library', (url: string) => api.get(url));
  const library = (Array.isArray(data) ? data : []).filter((i) => i.book);

  const counts = { all: library.length, reading: 0, unread: 0, done: 0 };
  library.forEach((i) => counts[status(i)]++);
  const shown = filter === 'all' ? library : library.filter((i) => status(i) === filter);
  const continueItem = library.find((i) => status(i) === 'reading');

  const tabs: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Semua' },
    { id: 'reading', label: 'Sedang dibaca' },
    { id: 'unread', label: 'Belum dibaca' },
    { id: 'done', label: 'Selesai' },
  ];

  return (
    <>
      <PageHeader
        title="Perpustakaan"
        description={library.length ? `${library.length} buku di koleksi Anda` : 'Koleksi buku digital Anda'}
        action={
          <Link href="/buku" className="inline-flex h-10 items-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Tambah koleksi
            <ArrowRight className="h-4 w-4" />
          </Link>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      ) : !library.length ? (
        <EmptyState
          icon={<Library className="h-7 w-7" />}
          title="Perpustakaan masih kosong"
          description="Buku yang sudah dibayar dan dikonfirmasi akan muncul di sini, siap dibaca kapan saja."
          actionText="Jelajahi katalog"
          actionHref="/buku"
        />
      ) : (
        <>
          {/* Lanjutkan membaca */}
          {continueItem?.book && (
            <Link
              href={`/baca/${continueItem.book.slug}`}
              className="group relative mb-10 flex items-center gap-5 overflow-hidden rounded-2xl bg-navy-deep p-5 text-white sm:p-6"
            >
              <div aria-hidden className="pointer-events-none absolute -right-10 -top-20 h-60 w-60 rounded-full bg-blue-600/30 blur-3xl" />
              <span className="relative aspect-[3/4.3] w-20 shrink-0 overflow-hidden rounded-lg shadow-xl ring-1 ring-white/10 sm:w-24">
                <BookCover title={continueItem.book.title} src={continueItem.book.cover_url} />
              </span>
              <div className="relative min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">Lanjutkan membaca</p>
                <p className="mt-1 line-clamp-1 font-display text-lg font-semibold sm:text-xl">{continueItem.book.title}</p>
                <p className="text-sm text-slate-400">{continueItem.book.author}</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${progress(continueItem).pct}%` }} />
                  </div>
                  <span className="text-xs tabular-nums text-slate-300">
                    {progress(continueItem).page}/{progress(continueItem).total}
                  </span>
                </div>
              </div>
              <span className="relative hidden h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 transition group-hover:scale-105 sm:flex">
                <Play className="ml-0.5 h-5 w-5 fill-current" />
              </span>
            </Link>
          )}

          <div className="no-scrollbar mb-6 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setFilter(t.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  filter === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {t.label}
                <span className="text-xs text-slate-400">{counts[t.id]}</span>
              </button>
            ))}
          </div>

          {shown.length ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
              {shown.map((item) => {
                const book = item.book!;
                const p = progress(item);
                const st = status(item);
                return (
                  <article key={item.id} className="group flex flex-col">
                    <Link
                      href={`/baca/${book.slug}`}
                      className="relative block aspect-[3/4.3] overflow-hidden rounded-xl shadow-[0_10px_30px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 transition group-hover:-translate-y-1"
                    >
                      <BookCover title={book.title} author={book.author} src={book.cover_url} />
                      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/40 opacity-0 transition group-hover:opacity-100">
                        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-900 shadow-lg">
                          {st === 'done' ? <RotateCcw className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5 fill-current" />}
                        </span>
                      </span>
                    </Link>
                    <h3 className="mt-3.5 line-clamp-2 font-display text-[15px] font-semibold leading-snug text-slate-900">{book.title}</h3>
                    <p className="mt-0.5 line-clamp-1 text-sm text-slate-500">{book.author}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full ${st === 'done' ? 'bg-emerald-500' : 'bg-blue-600'}`} style={{ width: `${st === 'unread' ? 0 : p.pct}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500">{st === 'unread' ? 'Baru' : `${p.pct}%`}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <EmptyState icon={<BookOpen className="h-7 w-7" />} title="Tidak ada buku di sini" description="Coba pilih tab lain." />
          )}
        </>
      )}
    </>
  );
}
