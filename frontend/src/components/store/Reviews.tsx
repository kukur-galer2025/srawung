'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import useSWRInfinite from 'swr/infinite';
import { BadgeCheck, Loader2, MessageSquareQuote, Pencil, Star, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog, toast } from '@/lib/dialog';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Stars } from '@/components/StarRating';
import type { ReviewPage } from '@/lib/types';

interface Mine {
  can_review: boolean;
  review: { id: number; rating: number; title: string | null; body: string | null; is_hidden: boolean; hidden_reason?: string | null } | null;
}

const LABELS = ['', 'Kurang', 'Cukup', 'Bagus', 'Sangat bagus', 'Luar biasa'];

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div className="flex" onMouseLeave={() => setHover(0)} role="radiogroup" aria-label="Pilih rating">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} bintang`}
            onMouseEnter={() => setHover(i)}
            onClick={() => onChange(i)}
            className="p-0.5 transition duration-200 hover:scale-110"
          >
            <Star className={`h-8 w-8 ${i <= shown ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} />
          </button>
        ))}
      </div>
      <span className="text-sm font-medium text-slate-600">{LABELS[shown]}</span>
    </div>
  );
}

function ReviewForm({ slug, mine, onSaved }: { slug: string; mine: Mine['review']; onSaved: () => void }) {
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [title, setTitle] = useState(mine?.title ?? '');
  const [body, setBody] = useState(mine?.body ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return toast.error('Pilih jumlah bintang terlebih dahulu.');
    setSaving(true);
    try {
      const res = await api.post(`/books/${encodeURIComponent(slug)}/reviews`, { rating, title, body });
      toast.success(res.message ?? 'Ulasan tersimpan.');
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan ulasan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-slate-200 bg-[#faf8f5] p-5 sm:p-6">
      <p className="font-display text-xl font-semibold text-slate-900">{mine ? 'Ubah ulasan Anda' : 'Bagaimana pendapat Anda tentang buku ini?'}</p>
      <StarPicker value={rating} onChange={setRating} />
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={120}
        placeholder="Judul singkat (opsional), mis. “Penjelasannya runtut dan jelas”"
        className="h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={2000}
        rows={4}
        placeholder="Ceritakan apa yang paling membantu, untuk siapa buku ini cocok, dan apa yang bisa lebih baik."
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">{body.length}/2000</span>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {mine ? 'Simpan perubahan' : 'Kirim ulasan'}
        </button>
      </div>
    </form>
  );
}

export function ReviewsSection({ slug, onChanged }: { slug: string; onChanged?: () => void }) {
  const { user } = useAuth();
  const [filter, setFilter] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);

  const getKey = (index: number, prev: ReviewPage | null) => {
    if (prev && prev.current_page >= prev.last_page) return null;
    return `/books/${encodeURIComponent(slug)}/reviews?page=${index + 1}${filter ? `&rating=${filter}` : ''}`;
  };
  const { data: pages, size, setSize, isLoading, mutate } = useSWRInfinite<ReviewPage>(getKey, (url: string) => api.get(url));
  const { data: mine, mutate: mutateMine } = useSWR<Mine>(user ? `/books/${encodeURIComponent(slug)}/reviews/mine` : null, (url: string) => api.get(url));

  const first = pages?.[0];
  const summary = first?.summary;
  const reviews = pages?.flatMap((p) => p.data) ?? [];
  const hasMore = !!pages && pages[pages.length - 1].current_page < pages[pages.length - 1].last_page;
  const count = summary?.count ?? 0;

  const refreshAll = () => {
    void mutate();
    void mutateMine();
    setEditing(false);
    onChanged?.();
  };

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Hapus ulasan Anda?', text: 'Ulasan dan rating Anda untuk buku ini akan dihapus.', confirmText: 'Hapus', tone: 'danger' });
    if (!ok) return;
    try {
      await api.delete(`/books/${encodeURIComponent(slug)}/reviews`);
      toast.success('Ulasan dihapus.');
      refreshAll();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus ulasan.');
    }
  };

  const myReview = mine?.review;
  const showForm = mine?.can_review && (!myReview || editing);

  return (
    <section id="ulasan" className="reveal mt-20 scroll-mt-24 border-t border-slate-200 pt-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow mb-3">Ulasan pembaca</p>
          <h2 className="font-display text-3xl font-medium tracking-tight text-slate-900 sm:text-[2.2rem]">
            Kata <em className="text-navy">mereka</em> yang sudah membaca
          </h2>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-14">
        {/* Ringkasan */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          {count > 0 ? (
            <div>
              <div className="flex items-end gap-3">
                <span className="font-display text-6xl font-medium leading-none text-slate-900">
                  {summary!.average.toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
                <div className="pb-1">
                  <Stars value={summary!.average} size={18} />
                  <p className="mt-1 text-sm text-slate-500">{count} ulasan</p>
                </div>
              </div>
              <ul className="mt-6 space-y-2">
                {[5, 4, 3, 2, 1].map((r) => {
                  const n = summary!.distribution[String(r)] ?? 0;
                  const pct = count ? Math.round((n / count) * 100) : 0;
                  const active = filter === r;
                  return (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => setFilter(active ? null : r)}
                        disabled={!n}
                        className={`group flex w-full items-center gap-3 rounded-lg px-2 py-1 text-sm transition disabled:cursor-default ${active ? 'bg-amber-50' : 'hover:bg-slate-50'}`}
                      >
                        <span className="flex w-8 items-center gap-1 text-slate-600">
                          {r}
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                        </span>
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <span className="block h-full rounded-full bg-amber-400 transition-all duration-700 ease-luxe" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-8 text-right tabular-nums text-slate-500">{n}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {filter && (
                <button onClick={() => setFilter(null)} className="mt-3 text-sm font-semibold text-slate-700 underline-offset-2 hover:underline">
                  Tampilkan semua rating
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
              <MessageSquareQuote className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-3 font-semibold text-slate-900">Belum ada ulasan</p>
              <p className="mt-1 text-sm text-slate-500">Jadilah pembaca pertama yang berbagi pendapat.</p>
            </div>
          )}
          <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Semua ulasan berasal dari pembeli terverifikasi yang memiliki buku ini.
          </p>
        </div>

        {/* Form & daftar */}
        <div className="min-w-0 space-y-6">
          {!user && (
            <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
              Sudah membaca buku ini?{' '}
              <Link href={`/masuk?redirect=${encodeURIComponent(`/buku/${slug}#ulasan`)}`} className="font-semibold text-slate-900 underline-offset-2 hover:underline">
                Masuk
              </Link>{' '}
              untuk menulis ulasan.
            </p>
          )}
          {user && mine && !mine.can_review && <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">Ulasan bisa ditulis setelah Anda memiliki buku ini.</p>}

          {showForm && <ReviewForm key={myReview?.id ?? 'new'} slug={slug} mine={myReview ?? null} onSaved={refreshAll} />}

          {myReview && !editing && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Ulasan Anda</p>
                  <Stars value={myReview.rating} size={16} className="mt-2" />
                  {myReview.title && <p className="mt-2 font-semibold text-slate-900">{myReview.title}</p>}
                  {myReview.body && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-700">{myReview.body}</p>}
                  {myReview.is_hidden && (
                    <p className="mt-3 text-xs font-medium text-rose-700">
                      Disembunyikan admin{myReview.hidden_reason ? `: ${myReview.hidden_reason}` : ''}. Ubah ulasan agar sesuai pedoman.
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button onClick={() => setEditing(true)} aria-label="Ubah ulasan" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-white">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={remove} aria-label="Hapus ulasan" className="flex h-9 w-9 items-center justify-center rounded-full text-slate-600 hover:bg-white hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-4">
              {[0, 1].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-slate-200">
              {reviews
                .filter((r) => !r.is_mine)
                .map((r) => (
                  <li key={r.id} className="py-6 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy font-display text-sm font-semibold text-amber-200">
                          {r.author.charAt(0)}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{r.author}</p>
                          <p className="flex items-center gap-1 text-xs text-emerald-700">
                            <BadgeCheck className="h-3.5 w-3.5" />
                            Pembeli terverifikasi
                          </p>
                        </div>
                      </div>
                      <time className="text-xs text-slate-400" dateTime={r.created_at}>
                        {formatDate(r.created_at)}
                      </time>
                    </div>
                    <Stars value={r.rating} size={15} className="mt-3" />
                    {r.title && <p className="mt-2 font-display text-lg font-semibold text-slate-900">{r.title}</p>}
                    {r.body && <p className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-slate-600">{r.body}</p>}
                  </li>
                ))}
            </ul>
          )}

          {hasMore && (
            <button
              onClick={() => setSize(size + 1)}
              className="h-11 w-full rounded-full border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              Tampilkan ulasan lainnya
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
