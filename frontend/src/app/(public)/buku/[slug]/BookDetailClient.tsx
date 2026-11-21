'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  BookOpen,
  Bot,
  Check,
  ChevronLeft,
  ArrowRight,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Infinity as InfinityIcon,
  Languages,
  Layers,
  Loader2,
  Mail,
  MonitorSmartphone,
  ShieldCheck,
  ShoppingBag,
  Zap,
} from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { BookCard, BookCover, resolveCover } from '@/components/BookCard';
import { Modal } from '@/components/Modal';
import { Price, priceOf } from '@/components/Price';
import { Countdown } from '@/components/store/Countdown';
import { ShareButtons } from '@/components/store/ShareButtons';
import { BookViewTracker } from '@/components/store/BookViewTracker';
import { RecentlyViewedShelf } from '@/components/store/ForYou';
import { ReviewsSection } from '@/components/store/Reviews';
import { NextReadsSection } from '@/components/store/NextReads';
import { ReportBook } from '@/components/store/ReportBook';
import { openRoboNia } from '@/components/AssistantWidget';
import { WishlistButton } from '@/components/WishlistButton';
import { Stars } from '@/components/StarRating';
import { bookItem, track } from '@/lib/analytics';
import { formatRupiah } from '@/lib/utils';
import type { BookSummary } from '@/lib/types';

export interface BookDetailData extends BookSummary {
  synopsis: string;
  total_pages: number;
  preview_pages_count?: number;
  /** URL statis gambar pratinjau (thumbnail 240 px & penuh 900 px) — jauh lebih cepat daripada lewat API. */
  preview_images?: { page: number; thumb: string; full: string }[];
  is_owned?: boolean;
  creator?: { display_name: string; slug: string } | null;
  bundles?: { id: number; title: string; slug: string; price: number; individual_total: number; savings_percent: number; book_count: number }[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
/** Gambar pratinjau: pakai file statis bila tersedia, cadangannya lewat API (?w=240 untuk thumbnail). */
type PreviewImages = { page: number; thumb: string; full: string }[] | undefined;
const previewSrc = (slug: string, page: number, images?: PreviewImages, size: 'thumb' | 'full' = 'full') =>
  images?.find((i) => i.page === page)?.[size] ?? `${API_URL}/books/${encodeURIComponent(slug)}/preview/${page}${size === 'thumb' ? '?w=240' : ''}`;

export function BookDetailClient({ book, related = [] }: { book: BookDetailData; related?: (BookSummary & { reason?: string })[] }) {
  const router = useRouter();
  const { addItem, hasItem } = useCart();
  const { user } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [previewPage, setPreviewPage] = useState<number | null>(null);

  // Status kepemilikan butuh token login → diambil di sisi klien.
  const { data: live } = useSWR<BookDetailData>(user ? `/books/${book.slug}` : null, (url: string) => api.get(url));
  const owned = live?.is_owned ?? book.is_owned ?? false;

  const inCart = hasItem(book.id);
  const cover = resolveCover(book.cover_url);
  const { onSale, current } = priceOf(book);
  const previewCount = Math.max(0, Math.min(book.preview_pages_count ?? 5, book.total_pages || 0));

  // Dari hasil "Cari di dalam buku": ?halaman=N membuka pratinjau langsung di halaman tersebut.
  useEffect(() => {
    const n = Number(new URLSearchParams(window.location.search).get('halaman'));
    if (!(n >= 1 && n <= previewCount)) return;
    // Setelah render pertama (hindari hydration mismatch & render berantai).
    const t = setTimeout(() => setPreviewPage(n), 0);
    return () => clearTimeout(t);
  }, [previewCount]);
  const synopsis = book.synopsis || 'Sinopsis belum tersedia untuk buku ini.';
  const isLong = synopsis.length > 480;
  const [mainTitle, subTitle] = book.title.includes(':') ? [book.title.split(':')[0], book.title.split(':').slice(1).join(':').trim()] : [book.title, ''];

  const putInCart = (silent: boolean) => {
    addItem({ id: book.id, title: book.title, author: book.author, price: current, slug: book.slug, cover_url: cover }, { silent });
    if (inCart) return;
    track('add_to_cart', { currency: 'IDR', value: current, items: [bookItem(book)], item_id: book.id, item_name: book.title });
  };
  const addToCart = () => putInCart(false);

  // Analitik: lihat produk (sekali per buku).
  useEffect(() => {
    track('view_item', { currency: 'IDR', value: book.effective_price ?? book.price, items: [bookItem(book)], item_id: book.id, item_name: book.title });
  }, [book]);
  const buyNow = () => {
    if (!inCart) putInCart(true);
    router.push('/keranjang');
  };

  const facts = [
    { icon: FileText, label: 'Halaman', value: book.total_pages ? `${book.total_pages}` : '—' },
    { icon: Languages, label: 'Bahasa', value: 'Indonesia' },
    { icon: MonitorSmartphone, label: 'Format', value: 'E-book (web)' },
    { icon: InfinityIcon, label: 'Akses', value: 'Selamanya' },
  ];

  const details = [
    ['Judul', book.title],
    ['Penulis', book.author],
    ['Kategori', book.category?.name ?? '—'],
    ['Jumlah halaman', book.total_pages ? `${book.total_pages} halaman` : '—'],
    ['Pratinjau gratis', previewCount ? `${previewCount} halaman pertama` : '—'],
    ['Bahasa', 'Indonesia'],
    ['Format', 'Dibaca di peramban (tidak diunduh)'],
  ];

  const actions = owned ? (
    <Link
      href={`/baca/${book.slug}`}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(5,150,105,0.8)] transition hover:bg-emerald-700"
    >
      <BookOpen className="h-[18px] w-[18px]" />
      Baca sekarang
    </Link>
  ) : (
    <>
      <button
        onClick={buyNow}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-blue-700 px-6 text-[15px] font-bold text-white shadow-[0_10px_24px_-10px_rgba(29,78,216,0.8)] transition hover:bg-blue-800 active:scale-[0.99]"
      >
        Beli sekarang
      </button>
      <button
        onClick={addToCart}
        disabled={inCart}
        className={`flex h-12 w-full items-center justify-center gap-2 rounded-full border px-5 text-[15px] font-bold transition ${
          inCart ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        {inCart ? <Check className="h-[18px] w-[18px]" /> : <ShoppingBag className="h-[18px] w-[18px]" />}
        {inCart ? 'Sudah di keranjang' : 'Tambah ke keranjang'}
      </button>
    </>
  );

  const buyBox = (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_50px_-30px_rgba(15,23,42,0.35)]">
      {owned ? (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl bg-emerald-50 p-3.5 text-sm font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          Buku ini sudah ada di perpustakaan Anda.
        </div>
      ) : (
        <div className="mb-5">
          {onSale && (
            <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600 ring-1 ring-inset ring-rose-100">
              <Zap className="h-3.5 w-3.5 fill-current" />
              Harga promo
            </p>
          )}
          <Price book={book} size="lg" />
          {onSale && book.sale_ends_at && (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-rose-600">
              <Clock className="h-4 w-4" />
              Berakhir dalam <strong className="font-bold"><Countdown until={book.sale_ends_at} variant="inline" /></strong>
            </p>
          )}
          <p className="mt-2 text-xs text-slate-500">Sekali bayar · tanpa langganan · akses selamanya</p>
        </div>
      )}

      <div className="space-y-2.5">
        {actions}
        {!owned && <WishlistButton bookId={book.id} title={book.title} variant="outline" />}
      </div>

      {!owned && !!(live?.bundles ?? book.bundles)?.length && (
        <div className="mt-4 space-y-2">
          {(live?.bundles ?? book.bundles)!.map((bd) => (
            <Link
              key={bd.id}
              href={`/paket/${bd.slug}`}
              className="flex items-center gap-3 rounded-xl border border-dashed border-brand-orange/50 bg-orange-50/50 px-3.5 py-3 text-sm transition hover:border-brand-orange hover:bg-orange-50"
            >
              <Layers className="h-5 w-5 shrink-0 text-brand-orange" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-slate-900">Hemat {bd.savings_percent}% di paket {bd.book_count} buku</span>
                <span className="block truncate text-xs text-slate-500">
                  {bd.title} · {formatRupiah(bd.price)}
                </span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
            </Link>
          ))}
        </div>
      )}

      {previewCount > 0 && !owned && (
        <button
          onClick={() => setPreviewPage(1)}
          className="mt-2.5 flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-blue-700 transition hover:bg-blue-50"
        >
          <Eye className="h-4 w-4" />
          Baca {previewCount} halaman gratis
        </button>
      )}

      <ul className="mt-5 space-y-2.5 border-t border-slate-100 pt-5 text-sm text-slate-600">
        {[
          { icon: InfinityIcon, t: 'Akses seumur hidup' },
          { icon: MonitorSmartphone, t: 'Baca di ponsel, tablet & laptop' },
          { icon: Mail, t: 'Invoice & konfirmasi via email' },
          { icon: ShieldCheck, t: 'Konten resmi berlisensi' },
        ].map(({ icon: Icon, t }) => (
          <li key={t} className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 shrink-0 text-emerald-600" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="pb-28 lg:pb-0">
      <BookViewTracker id={book.id} slug={book.slug} />
      <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)_320px] lg:gap-10 xl:grid-cols-[300px_minmax(0,1fr)_340px] xl:gap-12">
        {/* ===== Sampul ===== */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div className="relative mx-auto w-full max-w-[260px] lg:max-w-none">
            <div aria-hidden className="absolute inset-x-6 -bottom-4 top-10 rounded-3xl bg-blue-900/20 blur-2xl" />
            <button
              onClick={() => previewCount && setPreviewPage(1)}
              className="group relative block aspect-[3/4.3] w-full overflow-hidden rounded-xl shadow-[0_30px_60px_-20px_rgba(15,23,42,0.55)] ring-1 ring-slate-900/10"
              aria-label="Lihat pratinjau"
            >
              <BookCover title={book.title} srcSet={book.cover_srcset} placeholder={book.cover_placeholder} author={book.author} src={cover} priority sizes="(max-width: 1024px) 260px, 300px" />
              {onSale && (
                <span className="absolute left-0 top-4 z-10 rounded-r-lg bg-rose-600 py-1.5 pl-3 pr-3.5 text-sm font-extrabold text-white shadow-md">
                  -{book.discount_percent}%
                </span>
              )}
              {previewCount > 0 && (
                <span className="absolute inset-x-3 bottom-3 z-10 flex h-10 items-center justify-center gap-2 rounded-lg bg-white/95 text-sm font-semibold text-navy opacity-0 shadow-lg backdrop-blur transition duration-500 ease-luxe group-hover:opacity-100">
                  <Eye className="h-4 w-4" />
                  Intip isi buku
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ===== Info ===== */}
        <div className="min-w-0">
          {book.category && (
            <Link href={`/buku?category=${book.category.slug}`} className="eyebrow mb-4 transition hover:opacity-80">
              {book.category.name}
            </Link>
          )}
          <h1 className="rise font-display text-4xl font-medium leading-[1.05] tracking-tight text-slate-900 sm:text-5xl">{mainTitle}</h1>
          {subTitle && <p className="rise delay-1 mt-3 font-display text-xl italic text-slate-500 sm:text-2xl">{subTitle}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <p className="text-slate-500">
              oleh <span className="font-semibold text-slate-900">{book.author}</span>
              {book.creator && (
                <>
                  {' · '}diterbitkan{' '}
                  <Link href={`/penulis/${book.creator.slug}`} className="font-semibold text-navy underline-offset-2 hover:underline">
                    {book.creator.display_name}
                  </Link>
                </>
              )}
            </p>
            {(book.rating_count ?? 0) > 0 ? (
              <a href="#ulasan" className="flex items-center gap-2 text-sm text-slate-600 transition hover:text-slate-900">
                <Stars value={book.rating_avg ?? 0} size={15} />
                <span className="font-semibold text-slate-900">{Number(book.rating_avg).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                <span className="underline-offset-2 hover:underline">({book.rating_count} ulasan)</span>
              </a>
            ) : (
              <a href="#ulasan" className="text-sm text-slate-500 underline-offset-2 hover:text-slate-900 hover:underline">
                Belum ada ulasan
              </a>
            )}
          </div>

          {/* Fakta singkat */}
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
            {facts.map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-white px-4 py-3.5">
                <dt className="flex items-center gap-1.5 text-xs text-slate-500">
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Kotak beli (mobile & tablet) */}
          <div className="mt-6 lg:hidden">{buyBox}</div>

          {/* Intip isi */}
          {previewCount > 0 && (
            <section className="mt-10">
              <div className="mb-4 flex items-end justify-between gap-3">
                <h2 className="font-display text-2xl font-medium text-slate-900">Intip <em>isi buku</em></h2>
                <button onClick={() => setPreviewPage(1)} className="text-sm font-semibold text-blue-700 hover:text-blue-900">
                  Buka pratinjau
                </button>
              </div>
              <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
                {Array.from({ length: Math.min(previewCount, 6) }, (_, i) => i + 1).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPreviewPage(p)}
                    className="group relative aspect-[1/1.41] w-28 shrink-0 overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-blue-300 sm:w-32"
                    aria-label={`Pratinjau halaman ${p}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- gambar pratinjau ber-watermark dari API, tidak perlu optimasi */}
                    <img
                      src={previewSrc(book.slug, p, book.preview_images, 'thumb')}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      onContextMenu={(e) => e.preventDefault()}
                      className="h-full w-full select-none object-cover object-top"
                    />
                    <span className="absolute bottom-1.5 right-1.5 rounded bg-slate-900/75 px-1.5 py-0.5 text-[10px] font-bold text-white">{p}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Sinopsis */}
          <section className="mt-10">
            <h2 className="mb-4 font-display text-2xl font-medium text-slate-900">Tentang <em>buku ini</em></h2>
            <div className={`relative whitespace-pre-line text-[15px] leading-relaxed text-slate-600 ${isLong && !expanded ? 'max-h-48 overflow-hidden' : ''}`}>
              {synopsis}
              {isLong && !expanded && <div className="absolute inset-x-0 bottom-0 h-20 bg-linear-to-t from-white to-transparent" />}
            </div>
            {isLong && (
              <button onClick={() => setExpanded((v) => !v)} className="mt-2 text-sm font-semibold text-blue-700 hover:text-blue-900">
                {expanded ? 'Tampilkan lebih sedikit' : 'Baca selengkapnya'}
              </button>
            )}
          </section>

          <AskRoboNia title={book.title} />

          {/* Detail */}
          <section className="mt-10">
            <h2 className="mb-4 font-display text-2xl font-medium text-slate-900">Detail buku</h2>
            <dl className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 text-sm">
              {details.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[150px_1fr] gap-4 px-4 py-3 sm:grid-cols-[180px_1fr]">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-semibold text-slate-900">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="mt-8">
            <ShareButtons title={book.title} />
          </div>
        </div>

        {/* ===== Kotak beli (desktop) ===== */}
        <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">{buyBox}</aside>
      </div>

      <NextReadsSection slug={book.slug} />

      <ReviewsSection slug={book.slug} onChanged={() => router.refresh()} />

      {/* Rekomendasi: hasil mesin rekomendasi (kemiripan isi + pembeli juga membeli) */}
      {related.length > 0 && (
        <section className="reveal mt-24 border-t border-slate-200 pt-14">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow mb-3">Rekomendasi</p>
              <h2 className="font-display text-3xl font-medium tracking-tight text-slate-900 sm:text-[2.2rem]">
                Pembaca buku ini <em className="text-navy">juga menyukai</em>
              </h2>
            </div>
            {book.category && (
              <Link href={`/buku?category=${book.category.slug}`} className="link-underline text-sm font-semibold text-slate-900">
                Semua {book.category.name}
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {related.slice(0, 5).map((b, i) => (
              <div key={b.id} className="reveal-item" style={{ '--i': i } as React.CSSProperties}>
                <BookCard {...b} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mt-20 [&:not(:has(section))]:hidden">
        <RecentlyViewedShelf excludeId={book.id} />
      </div>

      <ReportBook slug={book.slug} title={book.title} />

      {/* Bar aksi mobile */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center gap-3 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
        {!owned && (
          <div className="mr-auto min-w-0">
            {onSale && <p className="text-[11px] text-slate-400 line-through">{formatRupiah(book.price)}</p>}
            <p className={`text-base font-extrabold ${onSale ? 'text-rose-600' : 'text-slate-900'}`}>{formatRupiah(current)}</p>
          </div>
        )}
        {owned ? (
          <Link href={`/baca/${book.slug}`} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-emerald-600 text-sm font-bold text-white">
            <BookOpen className="h-4 w-4" />
            Baca sekarang
          </Link>
        ) : (
          <>
            <button
              onClick={addToCart}
              disabled={inCart}
              aria-label={inCart ? 'Sudah di keranjang' : 'Tambah ke keranjang'}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border ${inCart ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-300 text-slate-800'}`}
            >
              {inCart ? <Check className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
            </button>
            <button onClick={buyNow} className="h-11 rounded-full bg-blue-700 px-6 text-sm font-bold text-white">
              Beli sekarang
            </button>
          </>
        )}
      </div>

      {previewPage !== null && (
        <PreviewModal
          key={previewPage}
          initialPage={previewPage}
          onClose={() => setPreviewPage(null)}
          slug={book.slug}
          title={book.title}
          count={previewCount || 1}
          images={book.preview_images}
          onBuy={owned ? undefined : buyNow}
          price={current}
        />
      )}
    </div>
  );
}

function PreviewModal({
  initialPage,
  onClose,
  slug,
  title,
  count,
  onBuy,
  price,
  images,
}: {
  images?: PreviewImages;
  initialPage: number;
  onClose: () => void;
  slug: string;
  title: string;
  count: number;
  onBuy?: () => void;
  price: number;
}) {
  const [page, setPage] = useState(initialPage);
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const prev = () => setPage((p) => Math.max(1, p - 1));
  const next = () => setPage((p) => Math.min(count, p + 1));

  // Panah kiri/kanan untuk berpindah halaman; halaman berikutnya dimuat lebih dulu agar terasa instan.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(1, p - 1));
      if (e.key === 'ArrowRight') setPage((p) => Math.min(count, p + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count]);
  useEffect(() => {
    if (page < count) {
      const img = new window.Image();
      img.src = previewSrc(slug, page + 1, images);
    }
  }, [page, count, slug, images]);

  return (
    <Modal isOpen onClose={onClose} title={`Pratinjau · ${title}`} maxWidth="2xl">
      <div className="flex flex-col items-center">
        {/* Tinggi mengikuti layar → navigasi & tombol beli selalu terlihat tanpa menggulir. */}
        <div className="relative aspect-[1/1.41] h-[min(calc(100dvh-21rem),40rem)] max-w-full overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
          {!loaded[page] && !failed[page] && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          )}
          {failed[page] ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-slate-500">Halaman pratinjau belum tersedia.</div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- gambar pratinjau ber-watermark dari API
            <img
              key={page}
              src={previewSrc(slug, page, images)}
              alt={`Pratinjau halaman ${page}`}
              className={`absolute inset-0 h-full w-full select-none object-contain transition-opacity ${loaded[page] ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setLoaded((l) => ({ ...l, [page]: true }))}
              onError={() => setFailed((f) => ({ ...f, [page]: true }))}
              onContextMenu={(e) => e.preventDefault()}
              draggable={false}
            />
          )}
          {/* Area ketuk kiri/kanan untuk HP */}
          <button type="button" onClick={prev} disabled={page <= 1} aria-label="Halaman sebelumnya" className="absolute inset-y-0 left-0 w-1/4 disabled:cursor-default sm:hidden" />
          <button type="button" onClick={next} disabled={page >= count} aria-label="Halaman berikutnya" className="absolute inset-y-0 right-0 w-1/4 disabled:cursor-default sm:hidden" />
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={prev}
            disabled={page <= 1}
            aria-label="Halaman sebelumnya"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="min-w-28 text-center text-sm text-slate-600">
            Halaman <strong className="text-slate-900">{page}</strong> dari {count}
          </span>
          <button
            onClick={next}
            disabled={page >= count}
            aria-label="Halaman berikutnya"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {onBuy && (
          <div className="mt-4 flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 sm:p-4">
            <p className="min-w-0 text-[13px] leading-snug text-slate-600 sm:text-sm">
              {page >= count ? 'Ini halaman gratis terakhir. ' : ''}Lanjutkan membaca versi lengkapnya.
            </p>
            <button onClick={onBuy} className="h-10 shrink-0 rounded-full bg-blue-700 px-4 text-sm font-bold text-white transition hover:bg-blue-800 sm:h-11 sm:px-6">
              Beli · {formatRupiah(price)}
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Ajakan bertanya ke Kanca tentang buku yang sedang dibuka (hanya tampil bila Kanca aktif). */
function AskRoboNia({ title }: { title: string }) {
  const { data } = useSWR<{ enabled: boolean }>('/assistant/status', (url: string) => api.get(url), { revalidateOnFocus: false, shouldRetryOnError: false });
  if (!data?.enabled) return null;
  const prompts = ['Buku ini cocok untuk pemula?', 'Apa saja yang dibahas di buku ini?', 'Ada buku lain yang mirip?'];

  return (
    <section className="mt-8 rounded-2xl border border-jade-200/70 bg-linear-to-br from-amber-50 to-white p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-jade-300 to-brand-orange text-slate-950">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900">Masih ragu? Tanya Kanca soal buku ini</p>
          <p className="text-sm text-slate-600">Jawaban instan tentang isi, tingkat kesulitan, dan perbandingan dengan buku lain.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 sm:pl-13">
        {prompts.map((p) => (
          <button
            key={p}
            onClick={() => openRoboNia({ prompt: p, title })}
            className="rounded-full bg-white px-3.5 py-2 text-left text-[13px] font-medium text-slate-700 ring-1 ring-jade-200 transition hover:bg-jade-100 hover:text-slate-950"
          >
            {p}
          </button>
        ))}
        <button onClick={() => openRoboNia({ title })} className="rounded-full px-3 py-2 text-[13px] font-semibold text-amber-800 hover:underline">
          Tanya hal lain →
        </button>
      </div>
    </section>
  );
}
