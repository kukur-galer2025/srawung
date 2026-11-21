import { NewsletterForm } from '@/components/NewsletterForm';
import React from 'react';
import Link from 'next/link';
import { Lock, MessageCircle, ShieldCheck } from 'lucide-react';
import { BrandMark } from '@/components/Navbar';
import { CookieSettingsLink } from '@/components/CookieSettingsLink';
import { waAdminUrl } from '@/lib/contact';

const WA_URL = waAdminUrl('Halo Admin Srawung, saya butuh bantuan');

const COLUMNS = [
  {
    title: 'Belanja',
    links: [
      { name: 'Semua buku', href: '/buku' },
      { name: 'Promo & kupon', href: '/promo' },
      { name: 'Paket hemat', href: '/paket' },
      { name: 'Pemrograman', href: '/buku?category=pemrograman' },
      { name: 'Teknologi & AI', href: '/buku?category=teknologi-ai' },
      { name: 'Desain', href: '/buku?category=desain' },
      { name: 'Persiapan ujian', href: '/buku?category=persiapan-ujian' },
    ],
  },
  {
    title: 'Bantuan',
    links: [
      { name: 'Cara membeli', href: '/#cara-kerja' },
      { name: 'Pertanyaan umum (FAQ)', href: '/#faq' },
      { name: 'Blog & tips belajar', href: '/blog' },
      { name: 'Syarat & ketentuan', href: '/syarat-ketentuan' },
      { name: 'Kebijakan privasi', href: '/kebijakan-privasi' },
    ],
  },
  {
    title: 'Akun',
    links: [
      { name: 'Perpustakaan saya', href: '/perpustakaan' },
      { name: 'Riwayat pesanan', href: '/pesanan' },
      { name: 'Keranjang', href: '/keranjang' },
      { name: 'Masuk', href: '/masuk' },
      { name: 'Daftar', href: '/daftar' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-navy-deep text-slate-400">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="relative mb-14 overflow-hidden rounded-[1.75rem] border border-white/10 bg-linear-to-br from-white/[0.07] via-white/[0.03] to-transparent p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,0.8)] sm:p-10">
          <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-brand-orange/20 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute inset-x-10 top-0 h-px bg-linear-to-r from-transparent via-jade-200/40 to-transparent" />
          <div className="relative grid grid-cols-1 items-center gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-jade-200/80">Surat kabar Srawung</p>
              <p className="mt-3 font-display text-[1.65rem] leading-[1.15] font-semibold tracking-tight text-balance text-white sm:text-3xl">
                Kabar buku baru &amp; promo, langsung ke email
              </p>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">Beberapa email sebulan: rilis terbaru, kupon khusus pelanggan, dan artikel pilihan.</p>
            </div>
            <NewsletterForm />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="col-span-2 space-y-5 lg:col-span-1">
            <Link href="/" className="inline-flex" aria-label="Srawung — Beranda">
              <BrandMark dark />
            </Link>
            <p className="max-w-xs text-sm leading-relaxed">
              Ruang belajar dan berkarya bersama. <strong className="font-semibold text-white">Sinau Bareng, Berkarya Bareng.</strong> Ebook berlisensi — beli sekali, baca selamanya di semua perangkat.
            </p>
            <a
              href={WA_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 rounded-full border border-slate-700/80 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-emerald-500/50 hover:text-white"
            >
              <MessageCircle className="h-4 w-4 text-emerald-400" />
              Chat admin via WhatsApp
            </a>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Pembayaran</p>
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-white px-2.5 py-1 text-[12px] font-black tracking-[0.18em] text-slate-900">QRIS</span>
                <span className="text-xs leading-snug text-slate-400">Semua m-banking &amp; e-wallet</span>
              </div>
            </div>
          </div>

          {COLUMNS.map((col, i) => (
            <div key={col.title} className={i === 0 ? 'row-span-2 lg:row-span-1' : undefined}>
              <h4 className="mb-4 font-sans text-[11px] font-semibold uppercase tracking-[0.22em] text-jade-100/80">{col.title}</h4>
              <ul className="space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="inline-block py-0.5 transition hover:translate-x-0.5 hover:text-white">
                      {l.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-7 text-center text-xs sm:flex-row sm:text-left">
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} Srawung. Hak cipta dilindungi.</span>
            <CookieSettingsLink className="transition hover:text-white" />
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Konten dilindungi watermark
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-emerald-400" />
              Pembayaran diverifikasi manual
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
