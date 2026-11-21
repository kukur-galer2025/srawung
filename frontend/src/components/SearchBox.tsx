'use client';

import React, { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowUpRight, BookOpenCheck, Clock, CornerDownLeft, FileSearch, Folder, Search, Sparkles, TrendingUp, User, Wand2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatRupiah } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useGuestTopics, useRecentBooks } from '@/lib/reader-prefs';

/* ------------------------------------------------------------------ */
/* Tipe respons GET /search/suggest                                    */
/* ------------------------------------------------------------------ */

interface SuggestBook {
  id: number;
  title: string;
  slug: string;
  author: string;
  thumb: string | null;
  placeholder: string | null;
  price: number;
  effective_price: number;
  is_on_sale: boolean;
  category: string | null;
  owned: boolean;
  reason: string | null;
}

interface SuggestResult {
  query: string;
  corrected: string | null;
  personalized: boolean;
  books: SuggestBook[];
  total: number;
  categories: { name: string; slug: string; count: number }[];
  authors: { name: string; count: number }[];
  queries: string[];
}

interface DiscoverResult {
  personalized: boolean;
  trending: string[];
  for_you: SuggestBook[];
  categories: { name: string; slug: string; count: number; preferred: boolean }[];
}

/* ------------------------------------------------------------------ */
/* Riwayat pencarian di perangkat (localStorage, sinkron antar tab)   */
/* ------------------------------------------------------------------ */

const RECENT_KEY = 'amania_recent_searches';
const NONE: string[] = [];
const recentListeners = new Set<() => void>();
let recentCache: { raw: string | null; value: string[] } = { raw: null, value: NONE };

function readRecent(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RECENT_KEY);
  } catch {
    return NONE;
  }
  if (raw === recentCache.raw) return recentCache.value;
  let value = NONE;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    value = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, 6) : NONE;
  } catch {
    /* rusak → kosong */
  }
  recentCache = { raw, value };
  return value;
}

function writeRecent(list: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* storage diblokir */
  }
  recentListeners.forEach((l) => l());
}

export function rememberSearch(q: string) {
  const term = q.trim();
  if (term.length < 2) return;
  writeRecent([term, ...readRecent().filter((x) => x.toLowerCase() !== term.toLowerCase())]);
}

function subscribeRecent(cb: () => void) {
  recentListeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === RECENT_KEY && cb();
  window.addEventListener('storage', onStorage);
  return () => {
    recentListeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/* ------------------------------------------------------------------ */

/** Tandai bagian judul yang cocok dengan kata yang diketik. */
function Highlight({ text, query }: { text: string; query: string }) {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!words.length) return <>{text}</>;
  const parts = text.split(new RegExp(`(${words.join('|')})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded-sm bg-jade-100 px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

function Thumb({ book }: { book: SuggestBook }) {
  return (
    <span
      className="relative h-14 w-10 shrink-0 overflow-hidden rounded-[4px] bg-slate-100 bg-cover bg-center shadow-sm ring-1 ring-slate-900/5"
      style={book.placeholder ? { backgroundImage: `url("${book.placeholder}")` } : undefined}
    >
      {book.thumb && (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnail 160px dari backend, tidak perlu optimizer
        <img src={book.thumb} alt="" loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-cover" />
      )}
    </span>
  );
}

type Item = { key: string; href: string; onSelect?: () => void };

/**
 * Kotak pencarian dengan saran instan:
 *  - kosong: riwayat pencarian, pencarian populer, rekomendasi untuk Anda, kategori sesuai minat;
 *  - mengetik: buku paling relevan (BM25F + koreksi salah ketik, diperingkat ulang dengan minat
 *    pembaca & umpan balik klik), kategori, penulis, dan pelengkap kueri populer.
 * Keyboard: ↑/↓ pilih, Enter buka, Esc tutup. "/" memfokuskan kotak (diatur Navbar).
 */
export function SearchBox({
  variant = 'desktop',
  inputRef,
  onNavigate,
  className = '',
}: {
  variant?: 'desktop' | 'mobile';
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onNavigate?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const listId = useId();
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(variant === 'mobile');
  const [active, setActive] = useState(-1);
  const recent = useSyncExternalStore(subscribeRecent, readRecent, () => NONE);
  const seen = useRecentBooks();
  const prefs = useGuestTopics();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), q.trim() ? 140 : 0);
    return () => clearTimeout(t);
  }, [q]);

  // Tamu mengirim sinyal minat dari perangkatnya; pengguna login dipersonalisasi di server.
  const signals = !user ? `&seen=${(seen ?? []).slice(0, 30).join(',')}&prefs=${(prefs ?? []).join(',')}` : '';
  const key = open ? `/search/suggest?q=${encodeURIComponent(debounced)}${signals}` : null;
  const { data, isLoading } = useSWR<SuggestResult & DiscoverResult>(key, (url: string) => api.get(url), {
    keepPreviousData: true,
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  const typing = debounced !== '';
  const result = typing && data && 'books' in data && data.query === debounced ? (data as SuggestResult) : null;
  const discover = !typing && data && 'trending' in data ? (data as DiscoverResult) : null;
  const stale = typing && (!result || q.trim() !== debounced);

  useEffect(() => {
    if (!open || variant === 'mobile') return;
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, variant]);

  const go = (href: string, remember?: string) => {
    if (remember) rememberSearch(remember);
    setOpen(variant === 'mobile');
    setActive(-1);
    ref.current?.blur();
    onNavigate?.();
    router.push(href);
  };

  const clickBook = (b: SuggestBook) => {
    if (debounced) {
      rememberSearch(debounced);
      api.post('/search/click', { q: debounced, book_id: b.id }).catch(() => {});
    }
  };

  // Daftar datar item yang bisa dipilih dengan keyboard, sesuai urutan tampil.
  const items: Item[] = useMemo(() => {
    const list: Item[] = [];
    if (result) {
      result.books.forEach((b) => list.push({ key: `b${b.id}`, href: b.owned ? `/baca/${b.slug}` : `/buku/${b.slug}`, onSelect: () => clickBook(b) }));
      result.categories.forEach((c) => list.push({ key: `c${c.slug}`, href: `/buku?category=${c.slug}` }));
      result.authors.forEach((a) => list.push({ key: `a${a.name}`, href: `/buku?search=${encodeURIComponent(a.name)}` }));
      result.queries.forEach((x) => list.push({ key: `q${x}`, href: `/cari?q=${encodeURIComponent(x)}` }));
      list.push({ key: 'all', href: `/buku?search=${encodeURIComponent(debounced)}` });
      list.push({ key: 'inside', href: `/cari?q=${encodeURIComponent(debounced)}` });
    } else if (discover) {
      recent.forEach((x) => list.push({ key: `r${x}`, href: `/cari?q=${encodeURIComponent(x)}` }));
      discover.trending.forEach((x) => list.push({ key: `t${x}`, href: `/cari?q=${encodeURIComponent(x)}` }));
      discover.for_you.forEach((b) => list.push({ key: `f${b.id}`, href: b.owned ? `/baca/${b.slug}` : `/buku/${b.slug}` }));
      discover.categories.forEach((c) => list.push({ key: `k${c.slug}`, href: `/buku?category=${c.slug}` }));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clickBook hanya memakai debounced
  }, [result, discover, recent, debounced]);

  const idx = (k: string) => items.findIndex((i) => i.key === k);
  const optId = (k: string) => `${listId}-${k.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const activeKey = active >= 0 ? items[active]?.key : undefined;

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      if (!items.length) return;
      setActive((a) => (e.key === 'ArrowDown' ? (a + 1) % items.length : a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Escape') {
      if (q) setQ('');
      else {
        setOpen(variant === 'mobile');
        ref.current?.blur();
      }
      setActive(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = items[active];
      if (item) {
        item.onSelect?.();
        go(item.href, typing ? debounced : undefined);
      } else if (q.trim()) {
        go(`/cari?q=${encodeURIComponent(q.trim())}`, q.trim());
      }
    }
  };

  const row = (k: string, extra = '') =>
    `${extra} ${activeKey === k ? 'bg-slate-100' : 'hover:bg-slate-50'} flex w-full items-center gap-3 rounded-xl px-3 text-left transition`;

  const sectionTitle = (icon: React.ReactNode, label: string, action?: React.ReactNode) => (
    <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {icon}
        {label}
      </p>
      {action}
    </div>
  );

  const bookRow = (b: SuggestBook, k: string) => (
    <li key={k} role="option" id={optId(k)} aria-selected={activeKey === k}>
      <Link
        href={b.owned ? `/baca/${b.slug}` : `/buku/${b.slug}`}
        onClick={() => {
          clickBook(b);
          go(b.owned ? `/baca/${b.slug}` : `/buku/${b.slug}`);
        }}
        onMouseEnter={() => setActive(idx(k))}
        className={row(k, 'py-2')}
      >
        <Thumb book={b} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-1 text-sm font-semibold text-slate-900">
            <Highlight text={b.title} query={result?.corrected ?? debounced} />
          </span>
          <span className="line-clamp-1 text-xs text-slate-500">
            {b.author}
            {b.category ? ` · ${b.category}` : ''}
          </span>
          {(b.reason || b.owned) && (
            <span className={`mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium ${b.owned ? 'text-emerald-700' : 'text-jade-700'}`}>
              {b.owned ? <BookOpenCheck className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
              {b.owned ? 'Ada di perpustakaan Anda · baca sekarang' : b.reason}
            </span>
          )}
        </span>
        {!b.owned && (
          <span className="shrink-0 text-right">
            <span className={`block text-sm font-bold tabular-nums ${b.is_on_sale ? 'text-rose-600' : 'text-slate-900'}`}>{formatRupiah(b.effective_price)}</span>
            {b.is_on_sale && <span className="block text-[11px] tabular-nums text-slate-400 line-through">{formatRupiah(b.price)}</span>}
          </span>
        )}
      </Link>
    </li>
  );

  const chip = (k: string, label: React.ReactNode, href: string, icon: React.ReactNode, onRemove?: () => void) => (
    <li key={k} role="option" id={optId(k)} aria-selected={activeKey === k} className="group/chip relative">
      <Link
        href={href}
        onClick={() => go(href)}
        onMouseEnter={() => setActive(idx(k))}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition ${onRemove ? 'pr-7' : ''} ${
          activeKey === k ? 'border-slate-300 bg-slate-100 text-slate-900' : 'border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
      >
        {icon}
        {label}
      </Link>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Hapus "${typeof label === 'string' ? label : ''}" dari riwayat`}
          className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </li>
  );

  const panel = (
    <div
      id={listId}
      className={
        variant === 'desktop'
          ? 'absolute right-0 top-[calc(100%+0.5rem)] z-50 max-h-[min(36rem,calc(100dvh-6rem))] w-[min(30rem,calc(100vw-2rem))] overflow-y-auto overscroll-contain rounded-2xl border border-slate-200/80 bg-white p-2 shadow-[0_30px_70px_-25px_rgba(2,6,23,0.45)]'
          : 'mt-2 rounded-2xl border border-slate-200 bg-white p-1.5'
      }
    >
      {typing ? (
        !result ? (
          <p className="px-3 py-6 text-center text-sm text-slate-500">{isLoading ? 'Mencari…' : 'Mencari…'}</p>
        ) : (
          <div className={stale ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            {result.corrected && (
              <p className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs text-slate-500">
                <Wand2 className="h-3.5 w-3.5 text-jade-500" />
                Menampilkan hasil untuk <strong className="font-semibold text-slate-900">&ldquo;{result.corrected}&rdquo;</strong>
              </p>
            )}
            {result.books.length > 0 ? (
              <>
                {sectionTitle(<BookOpenCheck className="h-3 w-3" />, result.personalized ? 'Buku · diurutkan untuk Anda' : 'Buku')}
                <ul role="listbox" aria-label="Buku">
                  {result.books.map((b) => bookRow(b, `b${b.id}`))}
                </ul>
              </>
            ) : (
              <p className="px-3 pb-2 pt-4 text-sm text-slate-600">
                Belum ada judul yang cocok dengan <strong>&ldquo;{debounced}&rdquo;</strong>. Coba cari di dalam isi buku di bawah.
              </p>
            )}
            {(result.categories.length > 0 || result.authors.length > 0) && (
              <>
                {sectionTitle(<Folder className="h-3 w-3" />, 'Kategori & penulis')}
                <ul role="listbox" aria-label="Kategori dan penulis" className="flex flex-wrap gap-1.5 px-3 pb-1">
                  {result.categories.map((c) => chip(`c${c.slug}`, `${c.name} · ${c.count}`, `/buku?category=${c.slug}`, <Folder className="h-3.5 w-3.5 text-slate-400" />))}
                  {result.authors.map((a) =>
                    chip(`a${a.name}`, `${a.name} · ${a.count}`, `/buku?search=${encodeURIComponent(a.name)}`, <User className="h-3.5 w-3.5 text-slate-400" />)
                  )}
                </ul>
              </>
            )}
            {result.queries.length > 0 && (
              <>
                {sectionTitle(<TrendingUp className="h-3 w-3" />, 'Pencarian populer')}
                <ul role="listbox" aria-label="Pencarian populer">
                  {result.queries.map((x) => (
                    <li key={x} role="option" id={optId(`q${x}`)} aria-selected={activeKey === `q${x}`}>
                      <Link href={`/cari?q=${encodeURIComponent(x)}`} onClick={() => go(`/cari?q=${encodeURIComponent(x)}`, x)} onMouseEnter={() => setActive(idx(`q${x}`))} className={row(`q${x}`, 'h-9 text-sm text-slate-700')}>
                        <Search className="h-3.5 w-3.5 text-slate-400" />
                        <Highlight text={x} query={debounced} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <ul role="listbox" aria-label="Tindakan" className="mt-1.5 border-t border-slate-100 pt-1.5">
              <li role="option" id={optId('all')} aria-selected={activeKey === 'all'}>
                <Link href={`/buku?search=${encodeURIComponent(debounced)}`} onClick={() => go(`/buku?search=${encodeURIComponent(debounced)}`, debounced)} onMouseEnter={() => setActive(idx('all'))} className={row('all', 'h-10 text-sm font-semibold text-slate-900')}>
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                  Lihat semua {result.total > 0 ? `${result.total} ` : ''}hasil di katalog
                </Link>
              </li>
              <li role="option" id={optId('inside')} aria-selected={activeKey === 'inside'}>
                <Link href={`/cari?q=${encodeURIComponent(debounced)}`} onClick={() => go(`/cari?q=${encodeURIComponent(debounced)}`, debounced)} onMouseEnter={() => setActive(idx('inside'))} className={row('inside', 'h-10 text-sm text-slate-700')}>
                  <FileSearch className="h-4 w-4 text-slate-400" />
                  Cari &ldquo;{debounced}&rdquo; di dalam isi semua buku
                  <CornerDownLeft className="ml-auto h-3.5 w-3.5 text-slate-300" />
                </Link>
              </li>
            </ul>
          </div>
        )
      ) : !discover ? (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      ) : (
        <>
          {recent.length > 0 && (
            <>
              {sectionTitle(
                <Clock className="h-3 w-3" />,
                'Pencarian terakhir',
                <button type="button" onClick={() => writeRecent([])} className="text-[11px] font-medium text-slate-400 hover:text-slate-700">
                  Hapus semua
                </button>
              )}
              <ul role="listbox" aria-label="Pencarian terakhir" className="flex flex-wrap gap-1.5 px-3 pb-1">
                {recent.map((x) => chip(`r${x}`, x, `/cari?q=${encodeURIComponent(x)}`, <Clock className="h-3.5 w-3.5 text-slate-400" />, () => writeRecent(recent.filter((r) => r !== x))))}
              </ul>
            </>
          )}
          {discover.trending.length > 0 && (
            <>
              {sectionTitle(<TrendingUp className="h-3 w-3" />, 'Sedang dicari')}
              <ul role="listbox" aria-label="Sedang dicari" className="flex flex-wrap gap-1.5 px-3 pb-1">
                {discover.trending.map((x) => chip(`t${x}`, x, `/cari?q=${encodeURIComponent(x)}`, <TrendingUp className="h-3.5 w-3.5 text-slate-400" />))}
              </ul>
            </>
          )}
          {discover.for_you.length > 0 && (
            <>
              {sectionTitle(<Sparkles className="h-3 w-3" />, discover.personalized ? 'Untuk Anda' : 'Populer di Srawung')}
              <ul role="listbox" aria-label="Rekomendasi">
                {discover.for_you.map((b) => bookRow(b, `f${b.id}`))}
              </ul>
            </>
          )}
          {discover.categories.length > 0 && (
            <>
              {sectionTitle(<Folder className="h-3 w-3" />, 'Jelajahi kategori')}
              <ul role="listbox" aria-label="Kategori" className="flex flex-wrap gap-1.5 px-3 pb-2">
                {discover.categories.map((c) =>
                  chip(
                    `k${c.slug}`,
                    c.name,
                    `/buku?category=${c.slug}`,
                    c.preferred ? <Sparkles className="h-3.5 w-3.5 text-jade-500" /> : <Folder className="h-3.5 w-3.5 text-slate-400" />
                  )
                )}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) go(`/cari?q=${encodeURIComponent(q.trim())}`, q.trim());
        }}
        className="group relative"
      >
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={ref}
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Cari judul, penulis, topik…"
          aria-label="Cari buku"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeKey ? optId(activeKey) : undefined}
          autoComplete="off"
          className={
            variant === 'desktop'
              ? 'h-10 w-full rounded-full border border-slate-200/80 bg-slate-50 pl-10 pr-10 text-[13.5px] text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-navy/40 focus:bg-white focus:ring-4 focus:ring-navy/5'
              : 'h-11 w-full rounded-full border border-slate-200 bg-slate-50 pl-10 pr-10 text-base outline-none focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10'
          }
        />
        {q ? (
          <button
            type="button"
            onClick={() => {
              setQ('');
              ref.current?.focus();
            }}
            aria-label="Hapus kata kunci"
            className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          variant === 'desktop' && (
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden h-5 -translate-y-1/2 items-center rounded border border-slate-200 bg-white px-1.5 font-sans text-[11px] font-medium text-slate-400 group-focus-within:hidden lg:flex">
              /
            </kbd>
          )
        )}
      </form>
      {open && panel}
    </div>
  );
}
