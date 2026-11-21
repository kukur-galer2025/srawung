'use client';

import useSWR from 'swr';
import { Heart, Mail } from 'lucide-react';
import { api } from '@/lib/api';
import { BookCard } from '@/components/BookCard';
import { BookCardSkeleton } from '@/components/LoadingSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import type { BookSummary } from '@/lib/types';

export default function WishlistPage() {
  // Daftar ID dipakai tombol hati; daftar lengkap dimuat ulang saat ID berubah.
  const { data: ids } = useSWR<number[]>('/wishlist/ids', (url: string) => api.get(url));
  const { data, isLoading } = useSWR<{ data: BookSummary[] }>(['/wishlist', (ids ?? []).join(',')], () => api.get('/wishlist'), {
    keepPreviousData: true,
  });
  const books = (data?.data ?? []).filter((b) => !ids || ids.includes(b.id));
  const onSale = books.filter((b) => b.is_on_sale).length;

  return (
    <>
      <PageHeader
        title="Wishlist"
        description={books.length ? `${books.length} buku disimpan${onSale ? ` · ${onSale} sedang promo` : ''}` : 'Simpan buku incaran Anda di sini.'}
      />

      {books.length > 0 && (
        <p className="mb-6 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
          <Mail className="h-4 w-4 shrink-0" />
          Kami akan mengirim email saat buku di wishlist Anda sedang promo.
        </p>
      )}

      {isLoading && !data ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      ) : books.length ? (
        <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 xl:grid-cols-4">
          {books.map((b) => (
            <BookCard key={b.id} {...b} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Heart className="h-7 w-7" />}
          title="Wishlist masih kosong"
          description="Tekan ikon hati pada buku mana pun untuk menyimpannya. Kami kabari lewat email saat buku itu promo."
          actionText="Jelajahi katalog"
          actionHref="/buku"
        />
      )}
    </>
  );
}
