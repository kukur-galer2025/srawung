import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, BadgePercent, Info, Ticket, Zap } from 'lucide-react';
import { BookCard } from '@/components/BookCard';
import { Countdown } from '@/components/store/Countdown';
import { CouponCard } from '@/components/store/CouponCard';
import { fetchPublic } from '@/lib/server-api';
import type { BookSummary, PublicCoupon } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Promo & Kupon',
  description: 'Harga spesial dan kode kupon yang sedang berlaku di Srawung. Hemat untuk buku pemrograman, AI, desain, dan persiapan ujian.',
};

export default async function PromoPage() {
  const promo = await fetchPublic<{ books: BookSummary[]; coupons: PublicCoupon[] }>('/promo', 60);
  const books = promo?.books ?? [];
  const coupons = promo?.coupons ?? [];
  const maxDiscount = Math.max(0, ...books.map((b) => b.discount_percent ?? 0));
  const endsAt = books
    .map((b) => b.sale_ends_at)
    .filter((d): d is string => !!d)
    .sort()[0];

  return (
    <div className="bg-white pb-20">
      {/* Kepala halaman */}
      <section className="relative overflow-hidden bg-linear-to-br from-rose-600 via-rose-500 to-orange-500 text-white">
        <div aria-hidden className="bg-grid-dark mask-radial pointer-events-none absolute inset-0" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-yellow-300/30 blur-3xl" />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-14 sm:px-6 lg:flex-row lg:items-end lg:justify-between lg:px-8 lg:py-16">
          <div>
            <nav aria-label="Breadcrumb" className="mb-5 text-sm text-white/80">
              <Link href="/" className="hover:text-white">
                Beranda
              </Link>
              <span className="mx-2">/</span>
              <span className="font-semibold text-white">Promo</span>
            </nav>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ring-1 ring-inset ring-white/30">
              <Zap className="h-3.5 w-3.5 fill-current" />
              Promo berlangsung
            </p>
            <h1 className="rise delay-1 font-display text-5xl font-medium tracking-tight sm:text-6xl">
              {books.length ? `Hemat hingga ${maxDiscount}%` : 'Promo & kupon'}
            </h1>
            <p className="mt-3 max-w-xl text-white/85">
              {books.length
                ? `${books.length} buku dengan harga spesial. Gabungkan dengan kode kupon untuk potongan tambahan.`
                : 'Kode kupon yang sedang berlaku. Salin kodenya, lalu tempel di halaman keranjang.'}
            </p>
          </div>
          {endsAt && (
            <div className="rounded-2xl bg-white/15 p-4 ring-1 ring-inset ring-white/25 backdrop-blur">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">Harga promo berakhir dalam</p>
              <Countdown until={endsAt} />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Kupon */}
        <section className="pt-12">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-jade-600 ring-1 ring-inset ring-jade-100">
              <Ticket className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-3xl font-medium tracking-tight text-slate-900">Kode <em>kupon</em></h2>
              <p className="text-sm text-slate-500">Salin kode, lalu masukkan di kolom kupon pada halaman keranjang.</p>
            </div>
          </div>
          {coupons.length ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {coupons.map((c) => (
                <CouponCard key={c.code} coupon={c} />
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              <Info className="h-4 w-4 shrink-0" />
              Belum ada kupon publik saat ini. Pantau halaman ini atau ikuti pengumuman di beranda.
            </p>
          )}
        </section>

        {/* Buku promo */}
        <section className="pt-14">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100">
              <BadgePercent className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-display text-3xl font-medium tracking-tight text-slate-900">Harga <em>spesial</em></h2>
              <p className="text-sm text-slate-500">Harga sudah dipotong otomatis saat checkout.</p>
            </div>
          </div>
          {books.length ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
              {books.map((b) => (
                <BookCard key={b.id} {...b} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center">
              <p className="font-semibold text-slate-900">Belum ada buku berharga promo saat ini</p>
              <p className="mt-1 text-sm text-slate-500">Tetap hemat dengan kode kupon di atas.</p>
              <Link href="/buku" className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white hover:bg-slate-800">
                Jelajahi katalog
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>

        {/* Ketentuan */}
        <section className="mt-14 rounded-2xl bg-slate-50 p-6 text-sm leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
          <h2 className="mb-2 font-sans text-sm font-semibold text-slate-900">Ketentuan promo</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Harga promo berlaku untuk pesanan yang dibuat sebelum periode promo berakhir. Harga terkunci saat pesanan dibuat.</li>
            <li>Satu pesanan dapat memakai satu kode kupon. Kupon dapat digabung dengan harga promo.</li>
            <li>Kuota kupon dari pesanan yang kedaluwarsa dikembalikan otomatis.</li>
            <li>
              Ketentuan lengkap ada di{' '}
              <Link href="/syarat-ketentuan" className="font-semibold text-blue-700 hover:underline">
                Syarat & Ketentuan
              </Link>
              .
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
