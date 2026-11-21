'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { api } from '@/lib/api';
import { Logo } from '@/components/Logo';
import { SearchBox } from '@/components/SearchBox';
import {
  ArrowRight,
  ChevronDown,
  Heart,
  Library,
  LogOut,
  Menu,
  Package,
  Search,
  PenLine,
  ShieldCheck,
  ShoppingBag,
  User as UserIcon,
  X,
} from 'lucide-react';

interface Category {
  id: number;
  name: string;
  slug: string;
  books_count?: number;
}

const NAV_LINKS = [
  { name: 'Katalog', href: '/buku' },
  { name: 'Promo', href: '/promo' },
  { name: 'Paket', href: '/paket' },
  { name: 'Blog', href: '/blog' },
  { name: 'Cara beli', href: '/#cara-kerja' },
];

const ACCOUNT_LINKS = [
  { name: 'Perpustakaan saya', href: '/perpustakaan', icon: Library },
  { name: 'Wishlist', href: '/wishlist', icon: Heart },
  { name: 'Pesanan', href: '/pesanan', icon: Package },
  { name: 'Profil', href: '/profil', icon: UserIcon },
];

const CATEGORY_DOTS = ['bg-blue-500', 'bg-jade-500', 'bg-emerald-500', 'bg-violet-500', 'bg-rose-500', 'bg-sky-500'];

export function Avatar({ name, src, size = 32 }: { name: string; src?: string | null; size?: number }) {
  if (src) {
    return (
      <span className="relative block shrink-0 overflow-hidden rounded-full ring-2 ring-white" style={{ width: size, height: size }}>
        <Image src={src} alt={name} fill sizes={`${size}px`} className="object-cover" />
      </span>
    );
  }
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-600 to-indigo-700 font-bold text-white ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export function BrandMark({ dark = false, height = 30 }: { dark?: boolean; height?: number }) {
  return <Logo variant={dark ? 'white' : 'color'} height={height} priority={!dark} />;
}

/** Tutup popover saat klik di luar / tekan Escape. */
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, ref, close]);
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const { itemCount } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const menuRef = useRef<HTMLDivElement>(null);
  const catRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Bayangan halus muncul setelah halaman digulir.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const { data: catData } = useSWR<Category[]>('/categories', (url: string) => api.get(url).catch(() => []), {
    revalidateOnFocus: false,
  });
  const categories = (Array.isArray(catData) ? catData : []).filter((c) => (c.books_count ?? 1) > 0);

  // Tutup semua menu saat pindah halaman (pola "adjust state on prop change", tanpa effect).
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMobileOpen(false);
    setMenuOpen(false);
    setCatOpen(false);
  }

  useDismiss(menuOpen, menuRef, () => setMenuOpen(false));
  useDismiss(catOpen, catRef, () => setCatOpen(false));

  // Tekan "/" di mana saja untuk langsung mencari.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== '/' || el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const handleLogout = async () => {
    setMenuOpen(false);
    setMobileOpen(false);
    await logout();
    router.push('/');
  };

  const isActive = (href: string) => !href.includes('#') && (href === '/' ? pathname === '/' : pathname.startsWith(href));

  return (
    <header
      className={`sticky top-0 z-50 w-full border-b backdrop-blur-xl transition-[background-color,box-shadow,border-color] duration-500 ease-luxe ${
        scrolled ? 'border-slate-200/70 bg-white/90 shadow-[0_12px_32px_-22px_rgba(15,76,63,0.35)]' : 'border-slate-200/40 bg-white/75'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <Link href="/" className="shrink-0 transition hover:opacity-90" aria-label="Srawung — Beranda">
          <BrandMark />
        </Link>

        {/* Navigasi desktop */}
        <nav className="ml-8 hidden shrink-0 items-center gap-0.5 lg:flex">
          <div className="relative" ref={catRef}>
            <button
              onClick={() => setCatOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={catOpen}
              className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-2 text-[13.5px] font-medium tracking-[0.01em] transition ${
                catOpen ? 'bg-slate-100 text-navy' : 'text-slate-600 hover:text-navy'
              }`}
            >
              Kategori
              <ChevronDown className={`h-3.5 w-3.5 transition ${catOpen ? 'rotate-180' : ''}`} />
            </button>

            {catOpen && (
              <div
                role="menu"
                className="modal-panel absolute left-0 mt-2 w-[30rem] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10"
              >
                <div className="grid grid-cols-2 gap-1 p-2">
                  {categories.map((c, i) => (
                    <Link
                      key={c.id}
                      href={`/buku?category=${c.slug}`}
                      role="menuitem"
                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${CATEGORY_DOTS[i % CATEGORY_DOTS.length]}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-slate-800 group-hover:text-blue-700">{c.name}</span>
                        <span className="block text-xs text-slate-500">{c.books_count ?? 0} judul</span>
                      </span>
                    </Link>
                  ))}
                  {categories.length === 0 && <p className="col-span-2 px-3 py-4 text-sm text-slate-500">Kategori belum tersedia.</p>}
                </div>
                <Link
                  href="/buku"
                  className="group flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:text-blue-700"
                >
                  Lihat semua buku
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </div>
            )}
          </div>

          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(link.href) ? 'page' : undefined}
              className={`group whitespace-nowrap px-2.5 py-2 text-[13.5px] font-medium tracking-[0.01em] transition duration-300 xl:px-3 ${
                link.href === '/#cara-kerja' ? 'hidden xl:inline-block' : ''
              } ${isActive(link.href) ? 'text-navy' : 'text-slate-600 hover:text-navy'}`}
            >
              <span className="link-underline pb-0.5" aria-current={isActive(link.href) ? 'page' : undefined}>
                {link.name}
              </span>
            </Link>
          ))}
        </nav>

        {/* Pencarian (saran instan & dipersonalisasi) */}
        <SearchBox inputRef={searchRef} className="ml-auto hidden w-60 shrink xl:block 2xl:w-72" />

        {/* Kanan (desktop) */}
        <div className="ml-auto hidden shrink-0 items-center gap-1 md:flex xl:ml-3">
          <Link
            href="/cari"
            aria-label="Cari di dalam buku"
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-navy xl:hidden"
          >
            <Search className="h-[18px] w-[18px]" />
          </Link>
          <Link
            href="/keranjang"
            aria-label={`Keranjang (${itemCount} item)`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-navy"
          >
            <ShoppingBag className="h-[19px] w-[19px]" />
            {itemCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {itemCount}
              </span>
            )}
          </Link>

          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 transition hover:border-slate-300 hover:shadow-sm"
              >
                <Avatar name={user.name} src={user.avatar} size={30} />
                <span className="max-w-[110px] truncate text-sm font-semibold text-slate-800">{user.name.split(' ')[0]}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition ${menuOpen ? 'rotate-180' : ''}`} />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  className="modal-panel absolute right-0 mt-2 w-64 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl shadow-slate-900/10"
                >
                  <div className="flex items-center gap-3 border-b border-slate-100 p-4">
                    <Avatar name={user.name} src={user.avatar} size={40} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  <div className="p-1.5">
                    {user.role === 'admin' && (
                      <Link
                        href="/admin"
                        role="menuitem"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Dashboard admin
                      </Link>
                    )}
                    {user.role === 'creator' && (
                      <Link
                        href="/kreator"
                        role="menuitem"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
                      >
                        <PenLine className="h-4 w-4" />
                        Studio kreator
                      </Link>
                    )}
                    {ACCOUNT_LINKS.map(({ name, href, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        role="menuitem"
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 hover:text-slate-900"
                      >
                        <Icon className="h-4 w-4 text-slate-400" />
                        {name}
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-slate-100 p-1.5">
                    <button
                      onClick={handleLogout}
                      role="menuitem"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-rose-600 transition hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" />
                      Keluar
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="ml-1 flex shrink-0 items-center gap-4 border-l border-slate-200/80 pl-4">
              <Link href="/masuk" className="link-underline whitespace-nowrap py-1 text-[13.5px] font-medium text-slate-700 transition hover:text-navy">
                Masuk
              </Link>
              <Link
                href="/daftar"
                className="group relative inline-flex h-10 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full bg-navy pl-5 pr-4 text-[13px] font-semibold tracking-[0.02em] text-white shadow-[0_10px_24px_-12px_rgba(15,76,63,0.9)] ring-1 ring-inset ring-white/10 transition duration-500 ease-luxe hover:bg-navy-deep hover:shadow-[0_14px_30px_-12px_rgba(15,76,63,0.95)]"
              >
                <span aria-hidden className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/15 to-transparent transition-transform duration-700 ease-luxe group-hover:translate-x-[300%]" />
                Daftar gratis
                <ArrowRight className="h-3.5 w-3.5 text-brand-orange transition-transform duration-500 ease-luxe group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </div>

        {/* Kanan (mobile) */}
        <div className="ml-auto flex items-center gap-1 md:hidden">
          <Link href="/keranjang" aria-label="Keranjang" className="relative flex h-10 w-10 items-center justify-center rounded-full text-slate-700">
            <ShoppingBag className="h-5 w-5" />
            {itemCount > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {itemCount}
              </span>
            )}
          </Link>
          <button
            onClick={() => setMobileOpen((v) => !v)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
            aria-label={mobileOpen ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Laci menu (mobile) */}
      {mobileOpen && (
        <div className="max-h-[calc(100dvh-4rem)] space-y-5 overflow-y-auto border-t border-slate-200 bg-white px-4 pb-6 pt-4 shadow-xl md:hidden">
          <SearchBox variant="mobile" onNavigate={() => setMobileOpen(false)} />

          <nav className="grid gap-0.5">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-xl px-3 py-2.5 text-[15px] font-semibold ${isActive(link.href) ? 'bg-blue-50 text-blue-800' : 'text-slate-800'}`}
              >
                {link.name}
              </Link>
            ))}
          </nav>

          {categories.length > 0 && (
            <div>
              <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Kategori</p>
              <div className="flex flex-wrap gap-2 px-1">
                {categories.map((c) => (
                  <Link
                    key={c.id}
                    href={`/buku?category=${c.slug}`}
                    className="rounded-full border border-slate-200 px-3.5 py-1.5 text-sm font-medium text-slate-700"
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-slate-100 pt-4">
            {user ? (
              <div className="grid gap-0.5">
                <div className="mb-2 flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                  <Avatar name={user.name} src={user.avatar} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                    <p className="truncate text-xs text-slate-500">{user.email}</p>
                  </div>
                </div>
                {user.role === 'admin' && (
                  <Link href="/admin" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-blue-700">
                    <ShieldCheck className="h-4 w-4" />
                    Dashboard admin
                  </Link>
                )}
                {user.role === 'creator' && (
                  <Link href="/kreator" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-violet-700">
                    <PenLine className="h-4 w-4" />
                    Studio kreator
                  </Link>
                )}
                {ACCOUNT_LINKS.map(({ name, href, icon: Icon }) => (
                  <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700">
                    <Icon className="h-4 w-4 text-slate-400" />
                    {name}
                  </Link>
                ))}
                <button onClick={handleLogout} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-rose-600">
                  <LogOut className="h-4 w-4" />
                  Keluar
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/masuk" className="rounded-full border border-slate-200 py-2.5 text-center text-sm font-semibold text-slate-700">
                  Masuk
                </Link>
                <Link href="/daftar" className="rounded-full bg-slate-900 py-2.5 text-center text-sm font-semibold text-white">
                  Daftar gratis
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
