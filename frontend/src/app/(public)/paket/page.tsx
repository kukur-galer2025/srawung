import type { Metadata } from 'next';
import Link from 'next/link';
import { Layers } from 'lucide-react';
import { BundleCard } from '@/components/store/BundleCard';
import { fetchPublic } from '@/lib/server-api';
import type { BundleSummary } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Paket Hemat',
  description: 'Beberapa e-book sekaligus dengan satu harga hemat. Buku yang sudah Anda miliki otomatis tidak ditagih lagi.',
};

export default async function BundlesPage() {
  const bundles = (await fetchPublic<BundleSummary[]>('/bundles', 60)) ?? [];
  const best = Math.max(0, ...bundles.map((b) => b.savings_percent));

  return (
    <div className="bg-white pb-20">
      <section className="relative overflow-hidden bg-navy text-white">
        <div aria-hidden className="bg-grid-dark mask-radial pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-orange/25 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-20">
          <p className="eyebrow rise mb-4 text-brand-orange">
            <Layers className="h-3.5 w-3.5" />
            Paket hemat
          </p>
          <h1 className="rise delay-1 max-w-2xl font-display text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Lebih banyak buku, {best > 0 ? <span className="text-brand-orange">hemat hingga {best}%</span> : 'harga lebih ringan'}
          </h1>
          <p className="rise delay-2 mt-5 max-w-xl text-base leading-relaxed text-white/75">
            Satu kali bayar untuk beberapa buku yang saling melengkapi. Sudah punya salah satunya? Harganya otomatis dikurangi — Anda tidak membayar dua kali.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        {bundles.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {bundles.map((b, i) => (
              <div key={b.id} className="reveal-item" style={{ ['--i' as string]: i }}>
                <BundleCard bundle={b} />
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-slate-300 p-10 text-center">
            <p className="font-display text-xl font-semibold text-slate-900">Belum ada paket saat ini</p>
            <p className="mt-2 text-sm text-slate-500">Paket hemat baru segera hadir. Sementara itu, lihat buku yang sedang promo.</p>
            <Link href="/promo" className="mt-5 inline-flex h-10 items-center rounded-full bg-blue-700 px-5 text-sm font-semibold text-white hover:bg-blue-800">
              Lihat promo
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
