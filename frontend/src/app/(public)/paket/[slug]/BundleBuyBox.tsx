'use client';

import Link from 'next/link';
import { Check, ShieldCheck, ShoppingBag } from 'lucide-react';
import { useAddBundle } from '@/components/store/BundleCard';
import type { BundleSummary } from '@/lib/types';
import { formatRupiah } from '@/lib/utils';

export function BundleBuyBox({ bundle }: { bundle: BundleSummary }) {
  const { inCart, add } = useAddBundle(bundle);

  return (
    <aside className="rounded-2xl border border-slate-200 p-6 shadow-[0_24px_48px_-32px_rgba(15,76,63,0.4)] lg:sticky lg:top-24">
      <p className="text-sm text-slate-500">Harga satuan</p>
      <p className="text-lg text-slate-400 line-through">{formatRupiah(bundle.individual_total)}</p>
      <p className="mt-2 text-sm text-slate-500">Harga paket</p>
      <p className="font-display text-4xl font-semibold tracking-tight text-slate-900">{formatRupiah(bundle.price)}</p>
      {bundle.savings > 0 && (
        <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
          Hemat {formatRupiah(bundle.savings)} ({bundle.savings_percent}%)
        </p>
      )}

      {inCart ? (
        <Link href="/keranjang" className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 font-semibold text-white transition hover:bg-emerald-700">
          <Check className="h-5 w-5" />
          Di keranjang — checkout
        </Link>
      ) : (
        <button onClick={add} className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 font-semibold text-white transition hover:bg-blue-800">
          <ShoppingBag className="h-5 w-5" />
          Masukkan ke keranjang
        </button>
      )}

      <ul className="mt-6 space-y-3 text-sm text-slate-600">
        <li className="flex gap-2.5">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
          Sudah punya sebagian bukunya? Harga paket otomatis dikurangi di keranjang.
        </li>
      </ul>
    </aside>
  );
}
