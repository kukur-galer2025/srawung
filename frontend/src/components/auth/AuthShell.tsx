import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { CheckCircle2, KeyRound, Mail, ShieldCheck, Sparkles, Star } from 'lucide-react';

type Variant = 'login' | 'register' | 'recover';

const PANEL: Record<Variant, { eyebrow: string; title: string; body: string; points: { icon: typeof Star; text: string }[] }> = {
  login: {
    eyebrow: 'Selamat datang kembali',
    title: 'Lanjutkan bacaan Anda, tepat di halaman terakhir.',
    body: 'Progres baca tersinkron otomatis di ponsel, tablet, dan laptop. Tanpa aplikasi tambahan.',
    points: [
      { icon: ShieldCheck, text: 'Koleksi legal & terlindungi DRM' },
      { icon: Sparkles, text: 'Sinkron progres antar perangkat' },
      { icon: Star, text: 'Pratinjau gratis sebelum membeli' },
    ],
  },
  register: {
    eyebrow: 'Gabung gratis',
    title: 'Satu akun untuk semua buku pilihan Anda.',
    body: 'Daftar kurang dari satu menit, lalu baca pratinjau bab gratis sebelum memutuskan membeli.',
    points: [
      { icon: CheckCircle2, text: 'Akses selamanya untuk buku yang dibeli' },
      { icon: Mail, text: 'Notifikasi pesanan langsung ke email' },
      { icon: ShieldCheck, text: 'Pembayaran diverifikasi manual & aman' },
    ],
  },
  recover: {
    eyebrow: 'Pemulihan akun',
    title: 'Akses kembali perpustakaan Anda dengan aman.',
    body: 'Kami mengirim tautan sekali pakai ke email terdaftar. Tautan kedaluwarsa otomatis demi keamanan.',
    points: [
      { icon: Mail, text: 'Tautan dikirim ke email terdaftar' },
      { icon: KeyRound, text: 'Berlaku 60 menit, sekali pakai' },
      { icon: ShieldCheck, text: 'Semua sesi lama otomatis keluar' },
    ],
  },
};

const BOOKS = [
  { title: 'Laravel dari Nol sampai Deploy', author: 'Amania Press', from: '#1e3a8a', to: '#312e81', rotate: '-rotate-6', pos: 'left-0 top-6' },
  { title: 'Jago Prompting', author: 'Amania Press', from: '#b45309', to: '#78350f', rotate: 'rotate-3', pos: 'left-[38%] top-0 z-10' },
  { title: 'Sukses SNBT 2027', author: 'Amania Press', from: '#065f46', to: '#134e4a', rotate: 'rotate-[10deg]', pos: 'right-0 top-10' },
];

export function AuthLogo({ dark = false }: { dark?: boolean }) {
  return (
    <Link href="/" className="inline-flex transition hover:opacity-90" aria-label="Srawung — Beranda">
      <Logo variant={dark ? 'white' : 'color'} height={34} priority />
    </Link>
  );
}

export default function AuthShell({ variant, children }: { variant: Variant; children: ReactNode }) {
  const panel = PANEL[variant];

  return (
    <div className="grid min-h-dvh bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      {/* ============ Panel brand (desktop) ============ */}
      <aside className="relative hidden overflow-hidden bg-navy-deep text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:justify-between lg:p-12 xl:p-16">
        {/* Atmosfer */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)',
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -left-24 top-1/4 h-96 w-96 rounded-full bg-blue-600/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-24 right-0 h-80 w-80 rounded-full bg-jade-500/15 blur-3xl" />

        <div className="relative z-10">
          <AuthLogo dark />
        </div>

        <div className="relative z-10 max-w-lg">
          {/* Komposisi buku */}
          <div aria-hidden className="relative mb-12 h-56 w-full max-w-sm">
            {BOOKS.map((b) => (
              <div
                key={b.title}
                className={`absolute ${b.pos} ${b.rotate} flex h-52 w-36 flex-col justify-between overflow-hidden rounded-r-lg rounded-l-sm p-4 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] ring-1 ring-white/10`}
                style={{ background: `linear-gradient(145deg, ${b.from}, ${b.to})` }}
              >
                <span className="absolute inset-y-0 left-0 w-2.5 bg-linear-to-r from-black/30 via-white/10 to-transparent" />
                <span className="h-px w-8 bg-jade-300/70" />
                <div>
                  <p className="font-display text-[15px] font-semibold leading-snug text-white">{b.title}</p>
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-widest text-white/60">{b.author}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-jade-300 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5" />
            {panel.eyebrow}
          </p>
          <h2 className="font-display text-3xl font-medium leading-tight tracking-tight text-white xl:text-[2.5rem]">
            {panel.title}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-slate-300">{panel.body}</p>
        </div>

        <ul className="relative z-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-6 text-xs text-slate-300">
          {panel.points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-jade-300" />
              <span className="leading-snug">{text}</span>
            </li>
          ))}
        </ul>
      </aside>

      {/* ============ Area form ============ */}
      <main className="relative flex flex-col px-4 py-8 sm:px-10 lg:px-14 xl:px-20">
        <div className="flex items-center justify-between lg:justify-end">
          <div className="lg:hidden">
            <AuthLogo />
          </div>
          <Link href="/" className="text-sm font-medium text-slate-500 transition hover:text-slate-900">
            ← Beranda
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10 auth-fade-in">{children}</div>

        <p className="text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Srawung · Sinau Bareng, Berkarya Bareng
        </p>
      </main>
    </div>
  );
}
