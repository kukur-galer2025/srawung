'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Heart, Library, Loader2, Package, PenLine, ShieldCheck, ShoppingBag, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { Avatar, Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';

const MENU = [
  { name: 'Perpustakaan', short: 'Pustaka', href: '/perpustakaan', icon: Library },
  { name: 'Wishlist', href: '/wishlist', icon: Heart },
  { name: 'Pesanan', href: '/pesanan', icon: Package },
  { name: 'Keranjang', href: '/keranjang', icon: ShoppingBag },
  { name: 'Profil', href: '/profil', icon: UserIcon },
];

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();
  const { itemCount } = useCart();
  const isReader = pathname.startsWith('/baca/');

  useEffect(() => {
    if (!loading && !user) router.replace(`/masuk?redirect=${encodeURIComponent(pathname)}`);
  }, [user, loading, router, pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
      </div>
    );
  }
  if (!user) return null;
  if (isReader) return <>{children}</>;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="grid gap-8 md:grid-cols-[230px_1fr]">
          <aside className="hidden md:block">
            <div className="sticky top-24 space-y-6">
              <div className="flex items-center gap-3 px-2">
                <Avatar name={user.name} src={user.avatar} size={44} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
                  <p className="truncate text-xs text-slate-500">{user.email}</p>
                </div>
              </div>

              <nav className="space-y-0.5">
                {MENU.map(({ name, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      isActive(href) ? 'bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                    }`}
                  >
                    <Icon className={`h-[18px] w-[18px] ${isActive(href) ? 'text-blue-700' : 'text-slate-400'}`} />
                    {name}
                    {href === '/keranjang' && itemCount > 0 && (
                      <span className="ml-auto rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">{itemCount}</span>
                    )}
                  </Link>
                ))}
                {user.role === 'admin' && (
                  <Link
                    href="/admin"
                    className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-blue-200 px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                  >
                    <ShieldCheck className="h-[18px] w-[18px]" />
                    Panel admin
                  </Link>
                )}
                {user.role === 'creator' && (
                  <Link
                    href="/kreator"
                    className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-violet-200 px-3 py-2.5 text-sm font-semibold text-violet-700 transition hover:bg-violet-50"
                  >
                    <PenLine className="h-[18px] w-[18px]" />
                    Studio kreator
                  </Link>
                )}
              </nav>
            </div>
          </aside>

          <main className="min-w-0 pb-10 md:pb-0">{children}</main>
        </div>
      </div>

      {/* Navigasi bawah (mobile): dock melayang */}
      <nav
        aria-label="Navigasi akun"
        className="fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 mx-auto grid max-w-md grid-cols-5 gap-1 rounded-[1.4rem] bg-navy-deep/92 p-1.5 shadow-[0_20px_50px_-15px_rgba(2,6,23,0.75)] ring-1 ring-white/10 backdrop-blur-xl md:hidden"
      >
        {MENU.map((item) => {
          const { name, href, icon: Icon } = item;
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={name}
              aria-current={active ? 'page' : undefined}
              className={`relative flex min-w-0 flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10.5px] font-medium tracking-wide transition ${
                active ? 'bg-white/[0.09] text-white' : 'text-slate-400 active:bg-white/5'
              }`}
            >
              <Icon className={`h-[19px] w-[19px] ${active ? 'text-amber-300' : ''}`} strokeWidth={active ? 2.2 : 1.8} />
              <span className="max-w-full truncate">{'short' in item ? item.short : name}</span>
              {href === '/keranjang' && itemCount > 0 && (
                <span className="absolute right-[calc(50%-17px)] top-1 min-w-4 rounded-full bg-amber-400 px-1 text-center text-[9px] leading-4 font-bold text-slate-950 ring-2 ring-navy-deep">
                  {itemCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="bg-navy-deep pb-24 md:pb-0">
        <Footer />
      </div>
    </div>
  );
}
