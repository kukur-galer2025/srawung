'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { resolveCover } from '@/lib/utils';
import { BookOpen, Check, ShoppingBag, Sparkles } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { Price, priceOf } from '@/components/Price';
import { WishlistButton } from '@/components/WishlistButton';
import { RatingBadge } from '@/components/StarRating';
import { bookItem, track } from '@/lib/analytics';
import type { BookSummary } from '@/lib/types';

export interface BookCardProps extends Omit<BookSummary, 'synopsis'> {
  badge?: string;
  /** Alasan rekomendasi (mis. "Karena Anda tertarik …"). */
  reason?: string;
  synopsis?: string;
  /** @deprecated tidak ditampilkan — tidak ada data ulasan nyata. */
  rating?: number;
  /** @deprecated tidak ditampilkan — tidak ada data ulasan nyata. */
  reviewsCount?: number;
  /** Muat sampul segera (kartu di baris pertama). */
  eager?: boolean;
}

export { resolveCover };

/**
 * Sampul buku yang tampil instan:
 *  1. Placeholder buram mini (data URI ±200 byte dari API) langsung terlihat bersama HTML.
 *  2. Browser memilih varian WebP yang pas lewat srcset (160/320/640 px, ±5–35 KB) —
 *     bukan file sampul ukuran penuh — lalu memudarkannya di atas placeholder.
 *  3. Sampul prioritas (di atas lipatan) dimuat lebih dulu; sisanya lazy saat mendekati layar.
 * Tanpa srcset (sampul lama/eksternal/pratinjau unggahan) tetap memakai src biasa.
 */
export function BookCover({
  title,
  author,
  src,
  srcSet,
  placeholder,
  className = '',
  sizes = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px',
  priority = false,
  eager = false,
}: {
  title: string;
  author?: string;
  src: string | null;
  srcSet?: string | null;
  placeholder?: string | null;
  className?: string;
  sizes?: string;
  /** Di atas lipatan: unduh paling awal (fetchpriority=high). */
  priority?: boolean;
  /** Muat segera tanpa menunggu mendekati layar (baris pertama). */
  eager?: boolean;
}) {
  const [failedSet, setFailedSet] = useState(false);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // Gambar dari cache bisa selesai dimuat sebelum React terpasang (onLoad terlewat) → cek .complete.
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);
  const useSet = !!srcSet && !failedSet;

  return (
    <div className={`book-spine-effect relative h-full w-full overflow-hidden bg-slate-100 ${className}`}>
      {src && !error ? (
        <>
          {placeholder && (
            <span
              aria-hidden
              className={`absolute inset-0 scale-110 bg-cover bg-center blur-md transition-opacity duration-500 ${loaded ? 'opacity-0' : 'opacity-100'}`}
              style={{ backgroundImage: `url("${placeholder}")` }}
            />
          )}
          {/* eslint-disable-next-line @next/next/no-img-element -- varian sudah dioptimalkan backend; next/image hanya menambah antrean */}
          <img
            ref={imgRef}
            key={useSet ? 'set' : 'src'}
            // Urutan penting: srcSet & sizes dipasang SEBELUM src. Pada render di browser, React
            // menyetel atribut sesuai urutan; bila src lebih dulu, browser sudah mulai mengunduh
            // file sampul ukuran penuh sebelum sempat memilih varian kecil dari srcset.
            srcSet={useSet ? srcSet : undefined}
            sizes={useSet ? sizes : undefined}
            src={src}
            alt={title}
            loading={priority || eager ? 'eager' : 'lazy'}
            fetchPriority={priority ? 'high' : 'auto'}
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => (useSet ? setFailedSet(true) : setError(true))}
            className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-[1.03] ${
              loaded || !placeholder ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </>
      ) : (
        <div className="flex h-full w-full flex-col justify-between bg-linear-to-br from-slate-900 via-blue-950 to-indigo-950 p-5 text-white">
          <span className="h-px w-8 bg-jade-300/70" />
          <div>
            <p className="line-clamp-4 font-display text-sm font-semibold leading-snug">{title}</p>
            {author && <p className="mt-2 line-clamp-1 text-[10px] font-semibold uppercase tracking-widest text-white/60">{author}</p>}
          </div>
          <BookOpen className="h-4 w-4 text-jade-300/80" />
        </div>
      )}
    </div>
  );
}

export function BookCard(props: BookCardProps) {
  const { id, title, author, slug, cover_url, cover_srcset, cover_placeholder, badge, category, total_pages, reason, eager } = props;
  const { addItem, hasItem } = useCart();
  const inCart = hasItem(id);
  const cover = resolveCover(cover_url);
  const { onSale, current, percent } = priceOf(props);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Bila sudah ada, keranjang menampilkan pemberitahuan "sudah ada di keranjang".
    addItem({ id, title, author, price: current, slug, cover_url: cover });
    if (!inCart) track('add_to_cart', { currency: 'IDR', value: current, items: [bookItem(props)], item_id: id, item_name: title });
  };

  return (
    <article className="group relative flex flex-col">
      <div className="relative transition duration-700 ease-luxe group-hover:-translate-y-1.5">
      <Link
        href={`/buku/${slug}`}
        className="sheen relative block aspect-[3/4.3] overflow-hidden rounded-lg shadow-[0_8px_24px_-12px_rgba(15,23,42,0.35)] ring-1 ring-slate-900/5 transition duration-700 ease-luxe group-hover:shadow-[0_30px_50px_-20px_rgba(15,23,42,0.5)]"
      >
        <BookCover title={title} author={author} src={cover} srcSet={cover_srcset} placeholder={cover_placeholder} eager={eager} />
        {onSale ? (
          <span className="absolute left-0 top-3 z-10 rounded-r-md bg-rose-600 py-1 pl-2 pr-2.5 text-[11px] font-extrabold tracking-wide text-white shadow-md">
            -{percent}%
          </span>
        ) : badge ? (
          <span className="absolute left-0 top-3 z-10 rounded-r-md bg-jade-400 py-1 pl-2 pr-2.5 text-[10px] font-bold uppercase tracking-wider text-amber-950 shadow">
            {badge}
          </span>
        ) : null}

        {/* Aksi cepat saat hover (desktop) */}
        <span className="pointer-events-none absolute inset-x-2 bottom-2 z-10 hidden translate-y-3 opacity-0 transition duration-500 ease-luxe group-hover:translate-y-0 group-hover:opacity-100 md:block">
          <span className="flex h-9 items-center justify-center rounded-md bg-white/95 text-xs font-semibold tracking-wide text-navy shadow-lg backdrop-blur">
            Lihat detail &amp; pratinjau
          </span>
        </span>
      </Link>
      <WishlistButton bookId={id} title={title} className="absolute right-2 top-2 z-20 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 [&[aria-pressed=true]]:opacity-100" />
      </div>

      <div className="flex flex-1 flex-col pt-3">
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
          {category && <span className="truncate font-semibold uppercase tracking-[0.12em] text-slate-500">{category.name}</span>}
          {category && total_pages ? <span aria-hidden>·</span> : null}
          {total_pages ? <span className="shrink-0">{total_pages} hlm</span> : null}
        </div>
        <Link href={`/buku/${slug}`}>
          <h3
            className="line-clamp-2 font-display text-base font-semibold leading-snug tracking-tight text-slate-900 transition-colors duration-500 group-hover:text-navy"
            title={title}
          >
            {title}
          </h3>
        </Link>
        <p className="mt-0.5 line-clamp-1 text-[13px] text-slate-500">{author}</p>
        <RatingBadge avg={props.rating_avg} count={props.rating_count} className="mt-1" />
        {reason && (
          <p className="mt-2 line-clamp-2 flex items-start gap-1 text-[11.5px] leading-snug text-jade-700" title={reason}>
            <Sparkles className="mt-px h-3 w-3 shrink-0" />
            {reason}
          </p>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <Price book={props} size="md" className={onSale ? 'flex-col !items-start' : ''} />
          <button
            onClick={handleAddToCart}
            aria-label={inCart ? 'Sudah di keranjang' : `Tambah ${title} ke keranjang`}
            title={inCart ? 'Sudah di keranjang' : 'Tambah ke keranjang'}
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${
              inCart ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-900 hover:text-white'
            }`}
          >
            {inCart ? <Check className="h-4 w-4 stroke-[2.5]" /> : <ShoppingBag className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </article>
  );
}
