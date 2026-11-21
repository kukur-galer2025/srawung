'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BookOpen, ExternalLink, FileText, LayoutDashboard, Loader2, LogOut, Menu, Ticket, TrendingUp, Wallet, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar } from '@/components/Navbar';
import { Logo } from '@/components/Logo';
import { CreatorTermsGate } from '@/components/manage/CreatorTermsGate';

const NAV = [
  { name: 'Ringkasan', href: '/kreator', icon: LayoutDashboard },
  { name: 'Buku saya', href: '/kreator/buku', icon: BookOpen },
  { name: 'Voucher', href: '/kreator/voucher', icon: Ticket },
  { name: 'Analitik', href: '/kreator/analitik', icon: TrendingUp },
  { name: 'Pendapatan', href: '/kreator/pendapatan', icon: Wallet },
];

/** Studio kreator — tampilan sama bersihnya dengan admin, tetapi hanya berisi data milik kreator. */
export default function CreatorLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/masuk?redirect=/kreator');
    else if (user.role !== 'creator') router.replace(user.role === 'admin' ? '/admin' : '/');
  }, [user, loading, router]);

  if (loading || user?.role !== 'creator') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Cocokkan per segmen URL: /admin/laporan tidak boleh ikut aktif di /admin/laporan-konten.
  const isActive = (href: string) => (href === '/kreator' ? pathname === '/kreator' : pathname === href || pathname.startsWith(href + '/'));
  const current = NAV.find((i) => isActive(i.href));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-5">
        <Link href="/kreator" aria-label="Studio kreator" className="transition hover:opacity-80">
          <Logo height={22} />
        </Link>
        <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-700">Kreator</span>
      </div>
      <nav className="flex-1 space-y-px overflow-y-auto px-3 py-3" aria-label="Menu kreator">
        {NAV.map(({ name, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition ${
                active ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-violet-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
              {name}
            </Link>
          );
        })}
        <div className="!mt-5 border-t border-slate-100 pt-4">
          <Link href="/perpustakaan" className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">
            <BookOpen className="h-4 w-4 text-slate-400" />
            Perpustakaan saya
          </Link>
          <Link href="/syarat-kreator" target="_blank" className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">
            <FileText className="h-4 w-4 text-slate-400" />
            S&amp;K Kreator
          </Link>
        </div>
      </nav>
      <div className="shrink-0 border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <Avatar name={user.name} src={user.avatar} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-[11px] text-slate-500">{user.email}</p>
          </div>
          <button
            onClick={async () => {
              await logout();
              router.push('/');
            }}
            title="Keluar"
            aria-label="Keluar"
            className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="admin-ui min-h-screen bg-slate-50/70">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-slate-200/80 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="modal-backdrop absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <aside className="modal-panel absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button onClick={() => setOpen(false)} aria-label="Tutup menu" className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/80 bg-white/85 px-4 backdrop-blur sm:px-6 lg:px-8">
          <button onClick={() => setOpen(true)} aria-label="Buka menu" className="-ml-1 rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <p className="truncate text-sm font-medium text-slate-900">{current?.name ?? 'Studio kreator'}</p>
          <Link href="/" target="_blank" className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Lihat toko</span>
          </Link>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        <CreatorTermsGate />
      </div>
    </div>
  );
}
