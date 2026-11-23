'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  BarChart3,
  BookOpen,
  Bot,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Flag,
  GalleryHorizontal,
  Layers,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mails,
  Menu,
  MessageSquareQuote,
  Newspaper,
  PenLine,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tags,
  Ticket,
  Users,
  X,
  ScanSearch,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Avatar } from '@/components/Navbar';
import { Logo } from '@/components/Logo';

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }>; badge?: boolean };

/** Menu dikelompokkan per tugas sehari-hari, bukan per jenis data. */
const NAV: { group: string | null; items: NavItem[] }[] = [
  { group: null, items: [{ name: 'Ringkasan', href: '/admin', icon: LayoutDashboard }] },
  {
    group: 'Penjualan',
    items: [
      { name: 'Pesanan', href: '/admin/pesanan', icon: ClipboardCheck, badge: true },
      { name: 'Laporan', href: '/admin/laporan', icon: BarChart3 },
      { name: 'Laporan Kanca', href: '/admin/robonia', icon: Bot },
      { name: 'Kupon', href: '/admin/kupon', icon: Ticket },
      { name: 'Paket hemat', href: '/admin/paket', icon: Layers },
      { name: 'Kreator', href: '/admin/kreator', icon: PenLine },
    ],
  },
  {
    group: 'Katalog',
    items: [
      { name: 'Buku', href: '/admin/buku', icon: BookOpen },
      { name: 'Kategori', href: '/admin/kategori', icon: Tags },
      { name: 'Ulasan', href: '/admin/ulasan', icon: MessageSquareQuote },
      { name: 'Laporan konten', href: '/admin/laporan-konten', icon: Flag },
    ],
  },
  {
    group: 'Konten & promosi',
    items: [
      { name: 'Blog', href: '/admin/blog', icon: Newspaper },
      { name: 'Banner', href: '/admin/banner', icon: GalleryHorizontal },
      { name: 'Newsletter', href: '/admin/newsletter', icon: Mails },
      { name: 'Brosur PDF', href: '/admin/brosur', icon: FileText },
    ],
  },
  {
    group: 'Sistem',
    items: [
      { name: 'Pengguna', href: '/admin/pengguna', icon: Users },
      { name: 'Lacak bocoran', href: '/admin/lacak-bocoran', icon: ScanSearch },
      { name: 'Keamanan akun', href: '/admin/keamanan', icon: ShieldCheck },
      { name: 'Pengaturan', href: '/admin/pengaturan', icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, logout } = useAuth();
  const [open, setOpen] = useState(false);
  // Pengingat 2FA bisa ditutup untuk sesi ini (muncul lagi di tab/sesi baru sampai 2FA aktif).
  const [hide2fa, setHide2fa] = useState(() => {
    try {
      return typeof window !== 'undefined' && sessionStorage.getItem('hide-2fa-banner') === '1';
    } catch {
      return false;
    }
  });
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  const isAdmin = user?.role === 'admin';
  const { data: pending } = useSWR<{ total: number }>(isAdmin ? '/admin/orders?status=menunggu_verifikasi' : null, (url: string) => api.get(url), {
    refreshInterval: 60_000,
  });
  const pendingCount = pending?.total ?? 0;

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/masuk?redirect=/admin');
    else if (user.role !== 'admin') router.replace('/');
  }, [user, loading, router]);

  if (loading || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  // Cocokkan per segmen URL: /admin/laporan tidak boleh ikut aktif di /admin/laporan-konten.
  const isActive = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(href + '/'));
  const current = NAV.flatMap((g) => g.items).find((i) => isActive(i.href));

  const signOut = async () => {
    await logout();
    router.push('/');
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-5">
        <Link href="/admin" aria-label="Ringkasan admin" className="transition hover:opacity-80">
          <Logo height={22} />
        </Link>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Admin</span>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-3" aria-label="Menu admin">
        {NAV.map((g, gi) => (
          <div key={gi}>
            {g.group && <p className="mb-1 px-2.5 text-[11px] font-medium text-slate-400">{g.group}</p>}
            <div className="space-y-px">
              {g.items.map(({ name, href, icon: Icon, badge }) => {
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
                    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`} />
                    {name}
                    {badge && pendingCount > 0 && (
                      <span className="ml-auto min-w-5 rounded-full bg-amber-100 px-1.5 text-center text-[11px] font-semibold leading-5 text-amber-800">{pendingCount}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-slate-100 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <Avatar name={user.name} src={user.avatar} size={30} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-slate-900">{user.name}</p>
            <p className="truncate text-[11px] text-slate-500">{user.email}</p>
          </div>
          <button onClick={signOut} title="Keluar" aria-label="Keluar" className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
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
          <p className="truncate text-sm font-medium text-slate-900">{current?.name ?? 'Admin'}</p>
          <div className="ml-auto flex items-center gap-2">
            {pendingCount > 0 && !pathname.startsWith('/admin/pesanan') && (
              <Link
                href="/admin/pesanan"
                className="hidden items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200 transition hover:bg-amber-100 sm:inline-flex"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                {pendingCount} pesanan menunggu verifikasi
              </Link>
            )}
            <Link href="/" target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] text-slate-600 transition hover:bg-slate-100 hover:text-slate-900">
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Lihat toko</span>
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {!user.two_factor_enabled && pathname !== '/admin/keamanan' && !hide2fa && (
            <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-200/80 bg-amber-50/70 py-1.5 pl-3 pr-1.5 text-[13px] text-amber-900">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1 truncate">Verifikasi dua langkah belum aktif</span>
              <Link href="/admin/keamanan" className="shrink-0 rounded-md px-2 py-1 font-semibold hover:bg-amber-100">
                Aktifkan
              </Link>
              <button
                onClick={() => {
                  setHide2fa(true);
                  try {
                    sessionStorage.setItem('hide-2fa-banner', '1');
                  } catch {
                    /* abaikan */
                  }
                }}
                aria-label="Tutup pengingat"
                className="shrink-0 rounded-md p-1 text-amber-700/70 hover:bg-amber-100 hover:text-amber-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
