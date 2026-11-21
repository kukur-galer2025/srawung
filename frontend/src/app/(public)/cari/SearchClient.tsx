'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowRight, BookOpen, Eye, FileSearch, Lock, Search, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import type { BookSummary, Paginated } from '@/lib/types';
import { formatRupiah } from '@/lib/utils';
import { BookCover } from '@/components/BookCard';

interface InsideHit {
  id: number;
  title: string;
  slug: string;
  author: string;
  cover_url: string | null;
  price: number;
  effective_price: number;
  is_on_sale: boolean;
  category: { name: string; slug: string } | null;
  preview_pages: number;
  hits: number;
  is_owned?: boolean;
  pages: { page: number; free: boolean; snippet: string }[];
}

interface InsideResult {
  query: string;
  corrected: string | null;
  terms: string[];
  total_books: number;
  books: InsideHit[];
  took_ms: number;
}

const EXAMPLES = ['middleware laravel', 'deret angka', 'pandas groupby', 'pointer', 'auto layout figma', 'few shot prompt'];

/** Tandai kata yang dicari (awal kata, tidak peka huruf besar/kecil). */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const words = terms.filter((t) => t.length >= 2).sort((a, b) => b.length - a.length);
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})[\\p{L}\\p{N}]*`, 'giu');
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(text.slice(last, i));
    parts.push(
      <mark key={i} className="rounded bg-jade-200/70 px-0.5 text-slate-900">
        {m[0]}
      </mark>
    );
    last = i + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

export function SearchClient() {
  const router = useRouter();
  const params = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [input, setInput] = useState(q);

  const { data, error, isLoading } = useSWR<InsideResult>(q.length >= 2 ? `/search/inside?q=${encodeURIComponent(q)}` : null, (url: string) => api.get(url), {
    keepPreviousData: true,
  });
  const { data: titles } = useSWR<Paginated<BookSummary>>(q.length >= 2 ? `/books?search=${encodeURIComponent(q)}&per_page=6` : null, (url: string) => api.get(url));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = input.trim();
    if (v.length >= 2) router.push(`/cari?q=${encodeURIComponent(v)}`);
  };

  return (
    <div className="bg-white pb-20">
      <section className="border-b border-slate-200 bg-[#f7f5f0]">
        <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:py-16">
          <p className="eyebrow rise mb-3">
            <FileSearch className="h-3.5 w-3.5" />
            Cari di dalam buku
          </p>
          <h1 className="rise delay-1 font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Temukan topik di <em className="text-navy">ribuan halaman</em>, bukan hanya di judul
          </h1>
          <form onSubmit={submit} className="rise delay-2 relative mt-6" role="search">
            <Search className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="mis. relasi eloquent, soal deret angka, pandas groupby…"
              aria-label="Kata kunci"
              autoFocus={!q}
              className="h-14 w-full rounded-2xl border border-slate-200 bg-white pl-14 pr-32 text-base shadow-[0_18px_40px_-28px_rgba(15,76,63,0.45)] outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
            />
            <button type="submit" className="absolute right-2 top-2 h-10 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-800">
              Cari
            </button>
          </form>
          {!q && (
            <div className="mt-4 flex flex-wrap gap-2">
              {EXAMPLES.map((ex) => (
                <Link key={ex} href={`/cari?q=${encodeURIComponent(ex)}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 transition hover:border-slate-300 hover:text-slate-900">
                  {ex}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 pt-10 sm:px-6">
        {q.length < 2 ? (
          <p className="text-center text-sm text-slate-500">Ketik kata kunci untuk mencari di dalam isi semua buku Srawung.</p>
        ) : (
          <>
            {!!titles?.data.length && (
              <section className="mb-10">
                <h2 className="mb-3 font-sans text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Judul yang cocok</h2>
                <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
                  {titles.data.map((b) => (
                    <Link key={b.id} href={`/buku/${b.slug}`} className="flex w-64 shrink-0 items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-slate-300 hover:bg-slate-50">
                      <span className="relative aspect-[3/4.3] w-10 shrink-0 overflow-hidden rounded ring-1 ring-slate-900/5">
                        <BookCover title={b.title} src={b.cover_url} sizes="48px" />
                      </span>
                      <span className="line-clamp-2 text-sm font-semibold text-slate-900">{b.title}</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl font-semibold text-slate-900">Ditemukan di dalam isi buku</h2>
              {data && (
                <p className="text-sm text-slate-500">
                  {data.total_books} buku · {data.took_ms} ms
                </p>
              )}
            </div>

            {data?.corrected && (
              <p className="mb-5 flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
                <Sparkles className="h-4 w-4 shrink-0" />
                Menampilkan hasil untuk <strong>&ldquo;{data.corrected}&rdquo;</strong>
              </p>
            )}

            {isLoading && !data ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-44 animate-pulse rounded-2xl bg-slate-100" />
                ))}
              </div>
            ) : error ? (
              <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error instanceof Error ? error.message : 'Pencarian gagal.'}</p>
            ) : !data?.books.length ? (
              <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                <p className="font-semibold text-slate-900">Tidak ditemukan di isi buku mana pun</p>
                <p className="mt-1 text-sm text-slate-500">Coba kata lain yang lebih umum, atau periksa ejaannya.</p>
              </div>
            ) : (
              <ul className="space-y-5">
                {data.books.map((b) => (
                  <li key={b.id} className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="flex items-center gap-4 border-b border-slate-100 bg-slate-50/60 p-4">
                      <Link href={`/buku/${b.slug}`} className="relative aspect-[3/4.3] w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-slate-900/5">
                        <BookCover title={b.title} src={b.cover_url} sizes="64px" />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <Link href={`/buku/${b.slug}`} className="line-clamp-1 font-display text-lg font-semibold text-slate-900 hover:text-blue-700">
                          {b.title}
                        </Link>
                        <p className="text-sm text-slate-500">
                          Dibahas di <strong className="text-slate-700">{b.hits} halaman</strong>
                          {b.category ? ` · ${b.category.name}` : ''}
                        </p>
                      </div>
                      <div className="hidden shrink-0 text-right sm:block">
                        {b.is_owned ? (
                          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Sudah Anda miliki</span>
                        ) : (
                          <Link href={`/buku/${b.slug}`} className="inline-flex items-center gap-1 text-sm font-semibold text-blue-700 hover:text-blue-900">
                            {formatRupiah(b.effective_price)}
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        )}
                      </div>
                    </div>
                    <ul className="divide-y divide-slate-100">
                      {b.pages.map((p) => {
                        const href = b.is_owned ? `/baca/${b.slug}?halaman=${p.page}` : p.free ? `/buku/${b.slug}?halaman=${p.page}` : `/buku/${b.slug}`;
                        return (
                          <li key={p.page}>
                            <Link href={href} className="group flex gap-4 px-4 py-3 transition hover:bg-slate-50">
                              <span className="w-16 shrink-0 pt-0.5 text-xs font-semibold text-slate-400">hlm {p.page}</span>
                              <span className="min-w-0 flex-1">
                                <span className="block text-sm leading-relaxed text-slate-600">
                                  <Highlight text={p.snippet} terms={data.terms} />
                                </span>
                                <span className={`mt-1 inline-flex items-center gap-1 text-xs font-semibold ${b.is_owned || p.free ? 'text-blue-700' : 'text-slate-400'}`}>
                                  {b.is_owned ? (
                                    <>
                                      <BookOpen className="h-3.5 w-3.5" /> Buka di halaman ini
                                    </>
                                  ) : p.free ? (
                                    <>
                                      <Eye className="h-3.5 w-3.5" /> Baca gratis (pratinjau)
                                    </>
                                  ) : (
                                    <>
                                      <Lock className="h-3.5 w-3.5" /> Beli buku untuk membaca halaman ini
                                    </>
                                  )}
                                </span>
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
