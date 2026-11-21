'use client';

import Link from 'next/link';
import { Check, Layers, ShoppingBag } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { track } from '@/lib/analytics';
import type { BundleSummary } from '@/lib/types';
import { formatRupiah } from '@/lib/utils';
import { BookCover } from '@/components/BookCard';

/** Tumpukan sampul (maks. 3) yang menyiratkan "beberapa buku sekaligus". */
export function BundleCovers({ bundle, className = '' }: { bundle: BundleSummary; className?: string }) {
  const covers = bundle.books.slice(0, 3);
  return (
    <div className={`relative ${className}`}>
      {covers.map((b, i) => (
        <div
          key={b.id}
          className="absolute top-0 aspect-[3/4.3] w-[46%] overflow-hidden rounded-lg shadow-[0_12px_28px_-12px_rgba(15,76,63,0.55)] ring-1 ring-black/5 transition duration-500 ease-luxe"
          style={{
            left: `${i * 27}%`,
            transform: `rotate(${(i - 1) * 5}deg) translateY(${i === 1 ? -4 : 6}px)`,
            zIndex: i === 1 ? 3 : 2 - i,
          }}
        >
          <BookCover title={b.title} src={b.cover_url} sizes="160px" />
        </div>
      ))}
    </div>
  );
}

export function useAddBundle(bundle: BundleSummary) {
  const { addItem, hasBundle } = useCart();
  const inCart = hasBundle(bundle.id);
  const add = () => {
    addItem({
      type: 'bundle',
      id: bundle.id,
      title: bundle.title,
      author: `${bundle.book_count} buku`,
      price: bundle.price,
      slug: bundle.slug,
      cover_url: bundle.books[0]?.cover_url ?? null,
    });
    if (inCart) return;
    track('add_to_cart', { currency: 'IDR', value: bundle.price, items: [{ item_id: `bundle-${bundle.id}`, item_name: bundle.title, price: bundle.price, quantity: 1 }] });
  };
  return { inCart, add };
}

export function BundleCard({ bundle }: { bundle: BundleSummary }) {
  const { inCart, add } = useAddBundle(bundle);

  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white transition duration-500 ease-luxe hover:-translate-y-1 hover:shadow-[0_24px_48px_-24px_rgba(15,76,63,0.35)]">
      <Link href={`/paket/${bundle.slug}`} className="relative block bg-linear-to-br from-navy to-navy-deep px-8 pb-6 pt-8">
        <BundleCovers bundle={bundle} className="mx-auto aspect-[1.6/1] max-w-[260px]" />
        {bundle.savings_percent > 0 && (
          <span className="absolute right-4 top-4 rounded-full bg-brand-orange px-3 py-1 text-xs font-bold text-white shadow-lg">Hemat {bundle.savings_percent}%</span>
        )}
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <p className="eyebrow mb-2">
          <Layers className="h-3.5 w-3.5" />
          {bundle.book_count} buku
        </p>
        <Link href={`/paket/${bundle.slug}`} className="font-display text-lg font-semibold leading-snug text-slate-900 transition hover:text-blue-700">
          {bundle.title}
        </Link>
        <p className="mt-1 line-clamp-2 text-sm text-slate-500">{bundle.books.map((b) => b.title.split(':')[0]).join(' · ')}</p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-5">
          <div>
            <p className="text-xs text-slate-400 line-through">{formatRupiah(bundle.individual_total)}</p>
            <p className="text-xl font-bold tracking-tight text-slate-900">{formatRupiah(bundle.price)}</p>
          </div>
          <button
            onClick={add}
            disabled={inCart}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-blue-700 px-4 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:bg-emerald-600"
          >
            {inCart ? <Check className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
            {inCart ? 'Di keranjang' : 'Beli paket'}
          </button>
        </div>
      </div>
    </article>
  );
}
