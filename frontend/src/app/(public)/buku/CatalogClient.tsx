'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowUpDown, ArrowUpRight, BadgePercent, BookOpen, ChevronDown, Code2, Eye, GraduationCap, Check, Infinity as InfinityIcon, LayoutGrid, MessageCircle, Palette, Search, ShieldCheck, SlidersHorizontal, Sparkles, X, type LucideIcon, Wand2 } from 'lucide-react';
import { BookCard, BookCover } from '@/components/BookCard';
import { BookCardSkeleton } from '@/components/LoadingSkeleton';
import { Pagination } from '@/components/Pagination';
import { EmptyState } from '@/components/EmptyState';
import { api } from '@/lib/api';
import { formatRupiah } from '@/lib/utils';
import { waAdminUrl } from '@/lib/contact';
import type { BookSummary, Category, Paginated } from '@/lib/types';

const WA_REQUEST = waAdminUrl('Halo Admin Srawung, saya ingin request buku: ');

const SORTS = [
  { value: 'relevan', label: 'Paling relevan' },
  { value: 'terbaru', label: 'Terbaru' },
  { value: 'terlaris', label: 'Terlaris' },
  { value: 'diskon', label: 'Diskon terbesar' },
  { value: 'termurah', label: 'Harga terendah' },
  { value: 'termahal', label: 'Harga tertinggi' },
];

const PRICE_PRESETS = [
  { label: 'Di bawah Rp 50rb', min: '', max: '50000' },
  { label: 'Rp 50rb – 80rb', min: '50000', max: '80000' },
  { label: 'Di atas Rp 80rb', min: '80000', max: '' },
];

const CATEGORY_STYLE: Record<string, { icon: LucideIcon; tone: string; blurb: string }> = {
  pemrograman: { icon: Code2, tone: 'from-blue-500/15 to-indigo-500/5 text-blue-700', blurb: 'Web, backend, hingga bahasa sistem' },
  'teknologi-ai': { icon: Sparkles, tone: 'from-violet-500/15 to-fuchsia-500/5 text-violet-700', blurb: 'AI, prompting, dan data' },
  desain: { icon: Palette, tone: 'from-pink-500/15 to-rose-500/5 text-pink-700', blurb: 'UI/UX, visual, dan kreatif' },
  'persiapan-ujian': { icon: GraduationCap, tone: 'from-emerald-500/15 to-teal-500/5 text-emerald-700', blurb: 'CPNS, SNBT, dan tryout' },
};
const styleOf = (slug: string) => CATEGORY_STYLE[slug] ?? { icon: BookOpen, tone: 'from-slate-500/15 to-slate-500/5 text-slate-700', blurb: 'Koleksi pilihan Srawung' };

const PROMISES = [
  { icon: Eye, text: 'Pratinjau gratis' },
  { icon: InfinityIcon, text: 'Akses selamanya' },
  { icon: ShieldCheck, text: 'Konten berlisensi' },
];

export function CatalogClient() {
  const router = useRouter();
  const params = useSearchParams();

  const category = params.get('category') || params.get('kategori') || '';
  const search = params.get('search') || params.get('q') || '';
  // Saat mencari, urutan bawaan = paling relevan; tanpa kata kunci, "relevan" tidak bermakna.
  const rawSort = params.get('sort') || '';
  const sort = search ? rawSort || 'relevan' : rawSort && rawSort !== 'relevan' ? rawSort : 'terbaru';
  const onSale = params.get('promo') === '1';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const minPrice = params.get('min_price') || '';
  const maxPrice = params.get('max_price') || '';

  const [searchInput, setSearchInput] = useState(search);
  const [lastSearch, setLastSearch] = useState(search);
  const [priceOpen, setPriceOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [minDraft, setMinDraft] = useState(minPrice);
  const [maxDraft, setMaxDraft] = useState(maxPrice);
  const priceBtnRef = useRef<HTMLDivElement>(null);
  const pricePopRef = useRef<HTMLDivElement>(null);

  // Sinkronkan input dengan URL saat URL berubah (mis. dari pencarian di navbar).
  if (search !== lastSearch) {
    setLastSearch(search);
    setSearchInput(search);
  }

  useEffect(() => {
    if (!priceOpen) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!priceBtnRef.current?.contains(t) && !pricePopRef.current?.contains(t)) setPriceOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPriceOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [priceOpen]);

  const { data: categoriesData } = useSWR<Category[]>('/categories', (url: string) => api.get(url).catch(() => []));
  // Sembunyikan kategori tanpa buku terbit (kecuali yang sedang dipilih).
  const categories = (Array.isArray(categoriesData) ? categoriesData : []).filter((c) => (c.books_count ?? 1) > 0 || c.slug === category);
  const catalogSize = categories.reduce((n, c) => n + (c.books_count ?? 0), 0);

  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  if (category) qs.set('category', category);
  if (onSale) qs.set('on_sale', '1');
  qs.set('sort', sort);
  if (minPrice) qs.set('price_min', minPrice);
  if (maxPrice) qs.set('price_max', maxPrice);
  qs.set('page', String(page));
  qs.set('per_page', '20');

  const { data, isLoading, error } = useSWR<Paginated<BookSummary>>(`/books?${qs}`, (url: string) => api.get(url));
  const books = data?.data ?? [];
  const total = data?.total ?? 0;
  const lastPage = data?.last_page ?? 1;
  const corrected = data?.search?.corrected ?? null;

  const update = (updates: Record<string, string | number | null>) => {
    const next = new URLSearchParams(params.toString());
    next.delete('kategori');
    next.delete('q');
    for (const [k, v] of Object.entries(updates)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, String(v));
    }
    if (!('page' in updates)) next.delete('page');
    const str = next.toString();
    router.push(str ? `/buku?${str}` : '/buku', { scroll: 'page' in updates });
  };

  const clearAll = () => {
    setSearchInput('');
    setMinDraft('');
    setMaxDraft('');
    router.push('/buku');
  };

  const activeCategory = categories.find((c) => c.slug === category);
  const hasPrice = !!(minPrice || maxPrice);
  const hasFilters = !!(category || search || hasPrice || onSale);
  const priceLabel = hasPrice
    ? `${minPrice ? formatRupiah(Number(minPrice)) : 'Rp 0'} – ${maxPrice ? formatRupiah(Number(maxPrice)) : 'tanpa batas'}`
    : 'Harga';

  // Rak "Terlaris" hanya tampil di halaman awal tanpa filter — seperti etalase toko.
  const showShowcase = !hasFilters && page === 1;
  const { data: bestData } = useSWR<Paginated<BookSummary>>(showShowcase ? '/books?sort=terlaris&per_page=3' : null, (url: string) => api.get(url));
  const bestsellers = bestData?.data ?? [];

  // Sampul untuk tumpukan dekoratif di hero.
  const heroCovers = (bestsellers.length ? bestsellers : books).filter((b) => b.cover_url).slice(0, 3);

  const from = total ? (page - 1) * 20 + 1 : 0;
  const to = Math.min(page * 20, total);

  return (
    <div className="bg-[#fbfaf7] pb-24">
      {catOpen && (
        <CategoryModal
          categories={categories}
          active={category}
          total={catalogSize}
          onPick={(slug) => {
            setCatOpen(false);
            if (slug !== category) update({ category: slug || null });
          }}
          onClose={() => setCatOpen(false)}
        />
      )}

      {/* ===================== HERO ===================== */}
      <section className="relative overflow-hidden bg-navy-deep text-white">
        <div aria-hidden className="bg-grid-dark mask-radial pointer-events-none absolute inset-0 opacity-50" />
        <div aria-hidden className="pointer-events-none absolute -left-32 top-10 h-80 w-80 rounded-full bg-blue-600/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-[28rem] w-[28rem] rounded-full bg-brand-orange/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-jade-200/30 to-transparent" />

        <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 pb-14 pt-8 sm:px-6 sm:pb-16 sm:pt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:px-8 lg:pb-20 lg:pt-12">
          <div className="min-w-0">
            <nav aria-label="Breadcrumb" className="rise mb-8 flex items-center gap-2 text-xs text-slate-400">
              <Link href="/" className="transition hover:text-white">
                Beranda
              </Link>
              <span aria-hidden className="h-1 w-1 rounded-full bg-slate-600" />
              <span className="text-slate-200">Katalog</span>
              {activeCategory && (
                <>
                  <span aria-hidden className="h-1 w-1 rounded-full bg-slate-600" />
                  <span className="truncate text-jade-200">{activeCategory.name}</span>
                </>
              )}
            </nav>

            <p className="rise eyebrow text-jade-300/90">{activeCategory ? 'Koleksi kategori' : search ? 'Hasil pencarian' : onSale ? 'Penawaran terbatas' : 'Katalog Amania Press'}</p>
            <h1 className="rise delay-1 mt-4 font-display text-[2.6rem] font-medium leading-[1.02] tracking-tight text-balance sm:text-6xl lg:text-[4.2rem]">
              {activeCategory ? (
                <>
                  {activeCategory.name} <em className="text-jade-200">pilihan</em>
                </>
              ) : search ? (
                <>
                  Hasil untuk <em className="wrap-anywhere text-jade-200">&ldquo;{search}&rdquo;</em>
                </>
              ) : onSale ? (
                <>
                  Buku <em className="text-jade-200">promo</em> pekan ini
                </>
              ) : (
                <>
                  Bacaan yang <em className="text-jade-200">membentuk</em> keahlian Anda
                </>
              )}
            </h1>
            <p className="rise delay-2 mt-5 max-w-xl text-[15px] leading-relaxed text-slate-300 sm:text-base">
              Buku digital berlisensi untuk pemrograman, AI, desain, hingga persiapan ujian. Baca halaman awal gratis, beli sekali, simpan selamanya.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                update({ search: searchInput.trim() });
              }}
              className="rise delay-3 group relative mt-8 max-w-xl"
              role="search"
            >
              <div className="flex items-center rounded-full bg-white/[0.07] p-1.5 ring-1 ring-white/15 backdrop-blur-xl transition focus-within:bg-white/[0.1] focus-within:ring-jade-200/40">
                <Search className="ml-3.5 h-[18px] w-[18px] shrink-0 text-slate-400" />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Cari judul, penulis, atau topik…"
                  aria-label="Cari buku"
                  className="h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] text-white outline-none placeholder:text-slate-400"
                />
                <button
                  type="submit"
                  className="h-11 shrink-0 rounded-full bg-linear-to-r from-jade-300 to-brand-orange px-5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_-10px_rgba(47,174,123,0.9)] transition hover:brightness-105 sm:px-7"
                >
                  Cari
                </button>
              </div>
            </form>

            <dl className="rise delay-4 mt-9 grid max-w-xl grid-cols-3 divide-x divide-white/10 border-y border-white/10">
              <Stat label="Judul buku" value={catalogSize || '—'} />
              <Stat label="Kategori" value={categories.length || '—'} />
              <Stat label="Akses" value="Selamanya" small />
            </dl>
          </div>

          {/* Tumpukan sampul */}
          <div aria-hidden className="relative mx-auto hidden h-[22rem] w-full max-w-sm lg:block">
            {heroCovers.map((b, i) => (
              <div
                key={b.id}
                className={`absolute top-1/2 aspect-[3/4.3] w-48 -translate-y-1/2 overflow-hidden rounded-lg shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/15 transition duration-1000 ease-luxe ${
                  ['left-1/2 z-30 -translate-x-1/2', 'left-[6%] z-20 -rotate-[9deg] opacity-80', 'right-[6%] z-10 rotate-[9deg] opacity-80'][i]
                }`}
              >
                <BookCover title={b.title} srcSet={b.cover_srcset} placeholder={b.cover_placeholder} author={b.author} src={b.cover_url} sizes="200px" />
              </div>
            ))}
            {heroCovers.length > 0 && (
              <div className="absolute -bottom-2 left-1/2 z-40 -translate-x-1/2 rounded-full bg-white/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-jade-100 ring-1 ring-white/15 backdrop-blur">
                Paling dicari
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ===================== TOOLBAR ===================== */}
      <div className="sticky top-16 z-30 border-b border-slate-200/80 bg-[#fbfaf7]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="no-scrollbar -my-1 flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1">
            <button
              onClick={() => setCatOpen(true)}
              aria-haspopup="dialog"
              className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full pl-1.5 pr-3.5 text-sm font-semibold transition duration-300 ${
                activeCategory
                  ? 'bg-navy-deep text-white shadow-[0_10px_24px_-12px_rgba(11,59,49,0.8)]'
                  : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:ring-slate-300'
              }`}
            >
              <span className={`flex h-7 w-7 items-center justify-center rounded-full ${activeCategory ? 'bg-white/10 text-jade-300' : 'bg-slate-100 text-slate-500'}`}>
                {React.createElement(activeCategory ? styleOf(activeCategory.slug).icon : LayoutGrid, { className: 'h-3.5 w-3.5' })}
              </span>
              <span className="max-w-[9.5rem] truncate">{activeCategory ? activeCategory.name : 'Semua kategori'}</span>
              <ChevronDown className={`h-3.5 w-3.5 ${activeCategory ? 'text-white/60' : 'text-slate-400'}`} />
            </button>

                        <button
              onClick={() => update({ promo: onSale ? null : '1' })}
              aria-pressed={onSale}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
                onSale ? 'bg-rose-600 text-white shadow-[0_10px_24px_-12px_rgba(225,29,72,0.8)]' : 'bg-rose-50 text-rose-600 ring-1 ring-inset ring-rose-100 hover:bg-rose-100'
              }`}
            >
              <BadgePercent className="h-4 w-4" />
              Promo
            </button>

            <div className="relative shrink-0" ref={priceBtnRef}>
              <button
                onClick={() => setPriceOpen((v) => !v)}
                aria-expanded={priceOpen}
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
                  hasPrice ? 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-jade-200' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-slate-900'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="max-w-[12rem] truncate">{priceLabel}</span>
                <ChevronDown className={`h-3.5 w-3.5 transition ${priceOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>

          <SortSelect value={sort} searching={!!search} onChange={(v) => update({ sort: v })} className="hidden sm:flex" />
        </div>

        {/* Popover harga (di luar area scroll agar tidak terpotong) */}
        {priceOpen && (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div ref={pricePopRef} className="modal-panel absolute z-40 mt-1 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-900/10">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Rentang harga</p>
              <div className="mb-4 grid gap-1.5">
                {PRICE_PRESETS.map((p) => {
                  const active = minPrice === p.min && maxPrice === p.max;
                  return (
                    <button
                      key={p.label}
                      onClick={() => {
                        setMinDraft(p.min);
                        setMaxDraft(p.max);
                        update({ min_price: active ? null : p.min, max_price: active ? null : p.max });
                        setPriceOpen(false);
                      }}
                      className={`rounded-xl px-3 py-2.5 text-left text-sm transition ${active ? 'bg-amber-50 font-semibold text-amber-900' : 'text-slate-700 hover:bg-slate-50'}`}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  update({ min_price: minDraft, max_price: maxDraft });
                  setPriceOpen(false);
                }}
                className="space-y-2 border-t border-slate-100 pt-4"
              >
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: minDraft, set: setMinDraft, ph: 'Min (Rp)' },
                    { v: maxDraft, set: setMaxDraft, ph: 'Maks (Rp)' },
                  ].map((f) => (
                    <input
                      key={f.ph}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={1000}
                      placeholder={f.ph}
                      value={f.v}
                      onChange={(e) => f.set(e.target.value)}
                      className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-jade-400 focus:ring-4 focus:ring-jade-400/15"
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  {hasPrice && (
                    <button
                      type="button"
                      onClick={() => {
                        setMinDraft('');
                        setMaxDraft('');
                        update({ min_price: null, max_price: null });
                        setPriceOpen(false);
                      }}
                      className="h-10 flex-1 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Reset
                    </button>
                  )}
                  <button type="submit" className="h-10 flex-1 rounded-xl bg-navy-deep text-sm font-semibold text-white transition hover:bg-navy">
                    Terapkan
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* ===================== TERLARIS ===================== */}
        {showShowcase && bestsellers.length >= 3 && (
          <section className="pt-12 sm:pt-16" aria-labelledby="terlaris">
            <div className="mb-7 flex items-end justify-between gap-4">
              <div>
                <p className="eyebrow text-brand-orange">Etalase</p>
                <h2 id="terlaris" className="mt-2 font-display text-3xl font-medium tracking-tight text-slate-900 sm:text-4xl">
                  Paling banyak <em>dibaca</em>
                </h2>
              </div>
              <button onClick={() => update({ sort: 'terlaris' })} className="group hidden shrink-0 items-center gap-1 text-sm font-semibold text-slate-700 hover:text-slate-950 sm:inline-flex">
                Urutkan terlaris
                <ArrowUpRight className="h-4 w-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            </div>
            <ol className="no-scrollbar -mx-4 flex scroll-px-4 snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible sm:px-0">
              {bestsellers.map((b, i) => (
                <li key={b.id} className="w-[82%] shrink-0 snap-start sm:w-auto">
                  <Link
                    href={`/buku/${b.slug}`}
                    className="group relative flex h-full items-center gap-4 overflow-hidden rounded-3xl bg-white p-4 sm:gap-5 sm:p-5 ring-1 ring-slate-200/80 transition duration-700 ease-luxe hover:-translate-y-1 hover:shadow-[0_30px_60px_-30px_rgba(15,23,42,0.35)] hover:ring-slate-300"
                  >
                    <span aria-hidden className="pointer-events-none absolute -right-2 -top-6 font-display text-[7.5rem] leading-none font-semibold text-slate-100 italic transition duration-700 group-hover:text-jade-100">
                      {i + 1}
                    </span>
                    <span className="sheen relative aspect-[3/4.3] w-20 shrink-0 overflow-hidden rounded-md sm:w-24 shadow-[0_18px_30px_-14px_rgba(15,23,42,0.55)] ring-1 ring-slate-900/5 transition duration-700 ease-luxe group-hover:-rotate-2">
                      <BookCover title={b.title} srcSet={b.cover_srcset} placeholder={b.cover_placeholder} author={b.author} src={b.cover_url} sizes="120px" />
                    </span>
                    <span className="relative min-w-0">
                      <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-brand-orange">No. {i + 1}</span>
                      <span className="mt-1 line-clamp-2 block font-display text-base leading-snug sm:text-lg font-semibold tracking-tight text-slate-900">{b.title}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-slate-500">{b.author}</span>
                      <span className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-sm font-bold whitespace-nowrap text-slate-900">{formatRupiah(b.effective_price ?? b.price)}</span>
                        {b.is_on_sale && <span className="text-xs font-medium whitespace-nowrap text-slate-400 line-through">{formatRupiah(b.price)}</span>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* ===================== HASIL ===================== */}
        <section className={showShowcase && bestsellers.length >= 3 ? 'pt-14 sm:pt-20' : 'pt-10'} aria-labelledby="hasil">
          <div className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="hasil" className="font-display text-2xl font-medium tracking-tight text-slate-900 sm:text-3xl">
                {activeCategory ? activeCategory.name : search ? 'Hasil pencarian' : onSale ? 'Sedang promo' : 'Seluruh koleksi'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {isLoading ? 'Memuat koleksi…' : total ? `Menampilkan ${from}–${to} dari ${total} judul` : 'Tidak ada judul'}
                {!isLoading && <span className="text-slate-400"> · diurutkan {SORTS.find((s) => s.value === sort)?.label.toLowerCase()}</span>}
              </p>
              {corrected && !isLoading && (
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm text-slate-600">
                  <Wand2 className="h-4 w-4 shrink-0 text-jade-500" />
                  Menampilkan hasil untuk <strong className="font-semibold text-slate-900">&ldquo;{corrected}&rdquo;</strong>
                  <span className="text-slate-400">· Anda mengetik &ldquo;{search}&rdquo;</span>
                </p>
              )}
            </div>
            <SortSelect value={sort} searching={!!search} onChange={(v) => update({ sort: v })} className="flex self-start sm:hidden" />
            {hasFilters && (
              <div className="flex flex-wrap items-center gap-2">
                {activeCategory && <Chip onClear={() => update({ category: null })}>{activeCategory.name}</Chip>}
                {search && <Chip onClear={() => update({ search: null })}>&ldquo;{search}&rdquo;</Chip>}
                {onSale && <Chip onClear={() => update({ promo: null })}>Sedang promo</Chip>}
                {hasPrice && <Chip onClear={() => update({ min_price: null, max_price: null })}>{priceLabel}</Chip>}
                <button onClick={clearAll} className="ml-1 text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline">
                  Hapus semua
                </button>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {Array.from({ length: 10 }).map((_, i) => (
                <BookCardSkeleton key={i} />
              ))}
            </div>
          ) : error ? (
            <EmptyState title="Katalog gagal dimuat" description="Periksa koneksi Anda lalu coba lagi." actionText="Muat ulang" onAction={() => router.refresh()} />
          ) : books.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 sm:gap-x-6 lg:grid-cols-4 xl:grid-cols-5 xl:gap-y-12">
              {books.map((book, i) => (
                <div key={book.id} className="reveal-item flex" style={{ '--i': i % 5 } as React.CSSProperties}>
                  <div className="w-full">
                    <BookCard {...book} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title={search ? `Belum ada buku untuk “${search}”` : 'Tidak ada buku yang cocok'}
              description={
                search
                  ? 'Coba kata kunci yang lebih umum. Pencarian Anda kami catat sebagai masukan judul baru, atau minta judulnya langsung ke admin di bawah.'
                  : 'Coba kata kunci lain atau hapus beberapa filter.'
              }
              actionText="Hapus semua filter"
              onAction={clearAll}
            />
          )}

          <Pagination currentPage={page} totalPages={lastPage} onPageChange={(p) => update({ page: p })} />
        </section>

        {/* ===================== PENUTUP ===================== */}
        <section className="relative mt-10 overflow-hidden rounded-[2rem] bg-navy-deep px-6 py-10 text-white sm:px-12 sm:py-14">
          <div aria-hidden className="bg-grid-dark mask-radial pointer-events-none absolute inset-0 opacity-40" />
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-brand-orange/25 blur-3xl" />
          <div className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <p className="eyebrow text-jade-300/90">Belum ketemu?</p>
              <p className="mt-3 font-display text-3xl leading-tight font-medium tracking-tight text-balance sm:text-4xl">
                Ceritakan buku yang Anda <em className="text-jade-200">cari</em>, kami bantu carikan.
              </p>
              <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-300">
                {PROMISES.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex items-center gap-2">
                    <Icon className="h-4 w-4 text-jade-300" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
            <a
              href={WA_REQUEST}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-navy-deep shadow-[0_18px_40px_-16px_rgba(255,255,255,0.5)] transition hover:bg-amber-50"
            >
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              Request buku via WhatsApp
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}

function CategoryModal({
  categories,
  active,
  total,
  onPick,
  onClose,
}: {
  categories: Category[];
  active: string;
  total: number;
  onPick: (slug: string) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const options = [{ id: 0, name: 'Semua kategori', slug: '', books_count: total } as Category, ...categories];

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="cat-title">
      <div className="modal-backdrop absolute inset-0 bg-slate-950/55 backdrop-blur-md" onClick={onClose} />
      <div className="modal-panel relative flex max-h-[min(40rem,calc(100dvh-2rem))] w-full max-w-2xl flex-col overflow-hidden rounded-[1.75rem] bg-white shadow-[0_40px_100px_-30px_rgba(2,6,23,0.7)] ring-1 ring-slate-900/5">
        <div className="relative overflow-hidden bg-navy-deep px-6 pb-6 pt-6 text-white sm:px-8 sm:pt-7">
          <div aria-hidden className="bg-grid-dark mask-radial pointer-events-none absolute inset-0 opacity-40" />
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-brand-orange/25 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.24em] text-jade-300/90">Jelajahi koleksi</p>
              <h2 id="cat-title" className="mt-2 font-display text-2xl font-medium tracking-tight sm:text-3xl">
                Pilih <em className="text-jade-200">kategori</em>
              </h2>
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80 ring-1 ring-white/15 transition hover:bg-white/20 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 sm:p-6">
          {options.map((c) => {
            const selected = active === c.slug;
            const { icon: Icon, tone, blurb } = c.slug ? styleOf(c.slug) : { icon: LayoutGrid, tone: 'from-jade-400/20 to-orange-400/5 text-jade-700', blurb: 'Tampilkan seluruh judul' };
            return (
              <li key={c.id}>
                <button
                  onClick={() => onPick(c.slug)}
                  aria-pressed={selected}
                  className={`group flex w-full items-center gap-4 rounded-2xl p-3.5 text-left transition duration-300 ${
                    selected ? 'bg-amber-50/70 ring-2 ring-jade-400' : 'bg-white ring-1 ring-slate-200 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.45)] hover:ring-slate-300'
                  }`}
                >
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-linear-to-br ${tone}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-slate-900">{c.name}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{blurb}</span>
                  </span>
                  {selected ? (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-jade-400 text-slate-950">
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                  ) : (
                    c.books_count !== undefined && (
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-600 transition group-hover:bg-slate-900 group-hover:text-white">
                        {c.books_count} judul
                      </span>
                    )
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>,
    document.body
  );
}

function SortSelect({ value, onChange, searching = false, className = '' }: { value: string; onChange: (v: string) => void; searching?: boolean; className?: string }) {
  return (
    <label className={`relative shrink-0 items-center ${className}`}>
      <span className="sr-only">Urutkan</span>
      <ArrowUpDown className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 appearance-none rounded-full border border-slate-200 bg-white pl-10 pr-9 text-sm font-semibold text-slate-800 outline-none transition hover:border-slate-300 focus:border-jade-400 focus:ring-4 focus:ring-jade-400/15"
      >
        {SORTS.filter((s) => searching || s.value !== 'relevan').map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" />
    </label>
  );
}

function Stat({ label, value, small = false }: { label: string; value: React.ReactNode; small?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-4 first:pl-0 sm:px-4">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</dt>
      <dd className={`mt-1 flex h-9 items-end font-display font-medium tabular-nums text-white ${small ? 'text-lg italic text-jade-100 sm:text-2xl' : 'text-2xl sm:text-3xl'}`}>{value}</dd>
    </div>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-8 items-center gap-1 rounded-full bg-white pl-3 pr-1 text-sm font-medium text-slate-800 ring-1 ring-slate-200">
      {children}
      <button onClick={onClear} aria-label="Hapus filter" className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-900">
        <X className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
