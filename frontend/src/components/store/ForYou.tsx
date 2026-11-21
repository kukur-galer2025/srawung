'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ChevronRight, History, SlidersHorizontal, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { clearRecentBooks, useGuestTopics, useRecentBooks } from '@/lib/reader-prefs';
import { BookRow } from '@/components/store/BookShelf';
import { TopicPicker } from '@/components/store/TopicPicker';
import type { BookSummary, Paginated } from '@/lib/types';

type Recommended = BookSummary & { reason: string };

function ShelfSkeleton() {
  return (
    <div className="flex gap-5 overflow-hidden">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="w-[44%] shrink-0 sm:w-[30%] md:w-[23%] lg:w-[calc((100%-5*1.25rem)/6)]">
          <div className="aspect-[3/4.3] animate-pulse rounded-lg bg-slate-100" />
          <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-slate-100" />
          <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

/**
 * Rak "Rekomendasi untuk Anda" — hasil mesin rekomendasi (riwayat lihat, buku yang
 * dimiliki, topik favorit, tren). Tiap buku diberi alasan singkat.
 */
export function ForYouShelf() {
  const { user, loading: authLoading } = useAuth();
  const recent = useRecentBooks();
  const guestTopics = useGuestTopics();
  const [pickerOpen, setPickerOpen] = useState(false);

  const ready = recent !== null && guestTopics !== null && !authLoading;
  const qs = new URLSearchParams({ limit: '12' });
  if (recent?.length) qs.set('seen', recent.slice(0, 15).join(','));
  if (!user && guestTopics?.length) qs.set('prefs', guestTopics.join(','));
  // user id ikut di key agar hasil dimuat ulang saat login/logout.
  const key = ready ? `/recommendations?${qs}&u=${user?.id ?? 0}` : null;

  const { data, isLoading, mutate } = useSWR<{ personalized: boolean; data: Recommended[] }>(key, (url: string) => api.get(url.replace(/&u=\d+$/, '')), {
    revalidateOnFocus: false,
  });
  const items = data?.data ?? [];
  const personalized = !!data?.personalized;

  if (ready && !isLoading && !items.length) return null;

  return (
    <section className="reveal">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-orange">
            <Sparkles className="h-3.5 w-3.5" />
            {personalized ? 'Dipersonalisasi' : 'Kurasi Srawung'}
          </p>
          <h2 className="font-display text-3xl font-medium tracking-tight text-slate-900 sm:text-[2.1rem]">
            {personalized ? (
              <>
                Rekomendasi <em className="italic text-navy">untuk Anda</em>
              </>
            ) : (
              <>
                Mulai dari <em className="italic text-navy">sini</em>
              </>
            )}
          </h2>
          <p className="mt-2 max-w-xl text-sm text-slate-500">
            {personalized
              ? 'Disusun dari buku yang Anda lihat, miliki, dan topik favorit Anda. Semakin sering menjelajah, semakin tepat.'
              : 'Pilih topik favorit Anda agar kami bisa menyarankan buku yang paling relevan.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:text-slate-900"
        >
          {pickerOpen ? <X className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
          {pickerOpen ? 'Tutup' : 'Atur topik favorit'}
        </button>
      </div>

      {(pickerOpen || (ready && !personalized)) && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-linear-to-br from-slate-50 to-white p-5 sm:p-6">
          <TopicPicker
            onSaved={() => {
              setPickerOpen(false);
              void mutate();
            }}
          />
          {!user && <p className="mt-3 text-xs text-slate-500">Tersimpan di perangkat ini. Masuk agar pilihan Anda terbawa ke semua perangkat.</p>}
        </div>
      )}

      {!ready || isLoading ? <ShelfSkeleton /> : <BookRow books={items} showReason />}
    </section>
  );
}

/** Rak "Terakhir Anda lihat" dari riwayat di browser. */
export function RecentlyViewedShelf({ excludeId }: { excludeId?: number }) {
  const recent = useRecentBooks();
  const ids = (recent ?? []).filter((id) => id !== excludeId).slice(0, 12);
  const { data } = useSWR<Paginated<BookSummary>>(ids.length ? `/books?ids=${ids.join(',')}&per_page=12` : null, (url: string) => api.get(url), {
    revalidateOnFocus: false,
  });

  if (!ids.length || !data?.data?.length) return null;
  const byId = new Map(data.data.map((b) => [b.id, b]));
  const ordered = ids.map((id) => byId.get(id)).filter((b): b is BookSummary => !!b);

  return (
    <section className="reveal">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
            <History className="h-3.5 w-3.5" />
            Riwayat
          </p>
          <h2 className="font-display text-3xl font-medium tracking-tight text-slate-900">Terakhir Anda lihat</h2>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={clearRecentBooks} className="text-sm font-medium text-slate-400 transition hover:text-slate-700">
            Hapus riwayat
          </button>
          <Link href="/buku" className="group inline-flex items-center gap-1 text-sm font-semibold text-slate-900">
            Katalog
            <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
      <BookRow books={ordered} />
    </section>
  );
}
