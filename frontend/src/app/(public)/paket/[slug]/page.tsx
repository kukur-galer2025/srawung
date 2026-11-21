import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { BookCover } from '@/components/BookCard';
import { BundleCovers } from '@/components/store/BundleCard';
import { Countdown } from '@/components/store/Countdown';
import { fetchPublic } from '@/lib/server-api';
import type { BundleSummary } from '@/lib/types';
import { formatRupiah } from '@/lib/utils';
import { BundleBuyBox } from './BundleBuyBox';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const bundle = await fetchPublic<BundleSummary>(`/bundles/${slug}`, 60);
  if (!bundle) return { title: 'Paket tidak ditemukan' };
  return {
    title: bundle.title,
    description: bundle.description ?? `${bundle.book_count} buku: ${bundle.books.map((b) => b.title).join(', ')}. Hemat ${bundle.savings_percent}%.`,
  };
}

export default async function BundleDetailPage({ params }: Props) {
  const { slug } = await params;
  const bundle = await fetchPublic<BundleSummary>(`/bundles/${slug}`, 60);
  if (!bundle) notFound();

  return (
    <div className="bg-white pb-20">
      <section className="relative overflow-hidden bg-linear-to-br from-navy to-navy-deep text-white">
        <div aria-hidden className="bg-grid-dark mask-radial pointer-events-none absolute inset-0" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:px-8 lg:py-16">
          <div>
            <Link href="/paket" className="mb-6 flex w-fit items-center gap-1 text-sm text-white/70 transition hover:text-white">
              <ChevronLeft className="h-4 w-4" />
              Semua paket
            </Link>
            <p className="eyebrow rise mb-3 text-brand-orange">Paket {bundle.book_count} buku</p>
            <h1 className="rise delay-1 font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{bundle.title}</h1>
            {bundle.description && <p className="rise delay-2 mt-4 max-w-xl whitespace-pre-line leading-relaxed text-white/75">{bundle.description}</p>}
            {bundle.ends_at && (
              <div className="rise delay-3 mt-6 inline-flex items-center gap-3 rounded-xl bg-white/10 px-4 py-2 text-sm ring-1 ring-white/15">
                <span className="text-white/70">Berakhir dalam</span>
                <Countdown until={bundle.ends_at} variant="inline" endedText="Paket telah berakhir" />
              </div>
            )}
          </div>
          <BundleCovers bundle={bundle} className="rise delay-2 mx-auto aspect-[1.6/1] w-full max-w-md" />
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl items-start gap-10 px-4 pt-12 sm:px-6 lg:grid-cols-[1fr_360px] lg:px-8">
        <section>
          <h2 className="mb-5 font-display text-2xl font-semibold text-slate-900">Isi paket</h2>
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
            {bundle.books.map((b) => (
              <li key={b.id} className="flex items-center gap-4 p-4">
                <Link href={`/buku/${b.slug}`} className="relative aspect-[3/4.3] w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-slate-900/5">
                  <BookCover title={b.title} src={b.cover_url} sizes="64px" />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/buku/${b.slug}`} className="line-clamp-2 font-semibold text-slate-900 hover:text-blue-700">
                    {b.title}
                  </Link>
                  <p className="truncate text-sm text-slate-500">{b.author}</p>
                </div>
                <p className="shrink-0 text-right text-sm">
                  <span className="block text-slate-400 line-through">{formatRupiah(b.effective_price)}</span>
                  <span className="text-xs text-slate-500">harga satuan</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
        <BundleBuyBox bundle={bundle} />
      </div>
    </div>
  );
}
