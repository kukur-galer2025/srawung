'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Banner } from '@/lib/types';

/** Preset latar banner — dipilih admin lewat kolom "theme". */
export const BANNER_THEMES: Record<string, { bg: string; glow: string; eyebrow: string; cta: string }> = {
  blue: { bg: 'from-blue-700 via-blue-800 to-indigo-900', glow: 'bg-sky-400/30', eyebrow: 'bg-white/15 text-sky-100', cta: 'bg-white text-blue-800 hover:bg-sky-50' },
  navy: { bg: 'from-navy-deep via-navy to-blue-900', glow: 'bg-blue-500/30', eyebrow: 'bg-jade-400 text-amber-950', cta: 'bg-jade-400 text-amber-950 hover:bg-jade-300' },
  amber: { bg: 'from-jade-500 via-orange-500 to-rose-500', glow: 'bg-yellow-200/40', eyebrow: 'bg-white/20 text-white', cta: 'bg-slate-900 text-white hover:bg-slate-800' },
  emerald: { bg: 'from-emerald-700 via-teal-700 to-cyan-800', glow: 'bg-emerald-300/30', eyebrow: 'bg-white/15 text-emerald-50', cta: 'bg-white text-emerald-800 hover:bg-emerald-50' },
  rose: { bg: 'from-rose-600 via-pink-600 to-fuchsia-700', glow: 'bg-pink-300/30', eyebrow: 'bg-white/20 text-white', cta: 'bg-white text-rose-700 hover:bg-rose-50' },
  violet: { bg: 'from-violet-700 via-purple-700 to-indigo-800', glow: 'bg-fuchsia-400/30', eyebrow: 'bg-white/15 text-violet-50', cta: 'bg-white text-violet-800 hover:bg-violet-50' },
};

const FALLBACK: Banner = {
  id: 0,
  eyebrow: 'Toko buku digital',
  title: 'Belajar skill baru dari buku yang tuntas',
  subtitle: 'Baca pratinjau gratis, bayar sekali, dan akses selamanya di semua perangkat.',
  cta_label: 'Jelajahi katalog',
  link_url: '/buku',
  image_url: null,
  theme: 'navy',
};

function SmartLink({ href, className, children, tabIndex }: { href: string; className?: string; children: React.ReactNode; tabIndex?: number }) {
  if (/^https?:\/\//i.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} tabIndex={tabIndex}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} tabIndex={tabIndex}>
      {children}
    </Link>
  );
}

export function BannerCarousel({ banners }: { banners: Banner[] }) {
  const slides = banners.length ? banners : [FALLBACK];
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  const go = useCallback((i: number) => setIndex(((i % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 6000);
    return () => clearInterval(t);
  }, [count, paused]);

  return (
    <div
      className="group/carousel relative overflow-hidden rounded-2xl sm:rounded-3xl"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="Promo & pengumuman"
    >
      <div className="flex transition-transform duration-1000 ease-luxe" style={{ transform: `translateX(-${index * 100}%)` }}>
        {slides.map((b, i) => {
          const t = BANNER_THEMES[b.theme] ?? BANNER_THEMES.blue;
          const active = i === index;
          return (
            <section
              key={b.id}
              aria-roledescription="slide"
              aria-label={`${i + 1} dari ${count}`}
              aria-hidden={!active}
              className={`relative flex min-h-[300px] w-full shrink-0 overflow-hidden bg-linear-to-br sm:min-h-[340px] lg:min-h-[380px] ${t.bg}`}
            >
              <div aria-hidden className="bg-grid-dark mask-radial pointer-events-none absolute inset-0 opacity-60" />
              <div aria-hidden className={`pointer-events-none absolute -right-20 -top-24 h-96 w-96 rounded-full blur-3xl ${t.glow}`} />

              {/* key berubah saat slide aktif → animasi masuk diputar ulang */}
              <div
                key={active ? `on-${index}` : 'off'}
                className="relative z-10 flex min-w-0 flex-1 flex-col justify-center p-6 pr-[43%] sm:p-10 sm:pr-[40%] lg:p-14 lg:pr-[42%]"
              >
                {b.eyebrow && (
                  <span className={`rise mb-5 inline-flex w-fit max-w-full rounded-full px-3 py-1 text-[10px] font-semibold whitespace-nowrap uppercase tracking-[0.14em] sm:text-[10.5px] sm:tracking-[0.2em] ${t.eyebrow}`}>{b.eyebrow}</span>
                )}
                <h2 className="rise delay-1 font-display text-[1.7rem] font-medium leading-[1.06] tracking-tight text-white sm:text-[2.6rem] lg:text-[3.1rem]">{b.title}</h2>
                {b.subtitle && <p className="rise delay-2 mt-3 max-w-lg text-sm leading-relaxed text-white/75 sm:mt-5 sm:text-base">{b.subtitle}</p>}
                {b.link_url && (
                  <SmartLink
                    href={b.link_url}
                    tabIndex={active ? 0 : -1}
                    className={`rise delay-3 group mt-6 inline-flex h-11 w-fit items-center gap-2 rounded-full px-5 text-sm font-semibold shadow-lg shadow-black/20 transition duration-500 ease-luxe hover:gap-3 sm:mt-9 sm:h-12 sm:px-6 ${t.cta}`}
                  >
                    {b.cta_label || 'Lihat selengkapnya'}
                    <ArrowRight className="h-4 w-4" />
                  </SmartLink>
                )}
              </div>

              {b.image_url && (
                <div aria-hidden className="pointer-events-none absolute bottom-0 right-[4%] top-0 flex w-[34%] items-center justify-center sm:right-[6%] lg:w-[30%]">
                  <div className="drift relative aspect-[3/4.3] w-full max-w-[220px] overflow-hidden rounded-lg shadow-[0_40px_70px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/20">
                    <Image
                      src={b.image_url}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 35vw, 220px"
                      priority={i === 0}
                      className="object-cover"
                      unoptimized={/^(blob:|http:\/\/(localhost|127\.0\.0\.1))/.test(b.image_url)}
                    />
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            onClick={() => go(index - 1)}
            aria-label="Slide sebelumnya"
            className="absolute left-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 opacity-0 shadow-lg transition group-hover/carousel:opacity-100 focus-visible:opacity-100 md:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => go(index + 1)}
            aria-label="Slide berikutnya"
            className="absolute right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 opacity-0 shadow-lg transition group-hover/carousel:opacity-100 focus-visible:opacity-100 md:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="absolute bottom-4 left-6 z-20 flex gap-1.5 sm:left-10 lg:left-14">
            {slides.map((b, i) => (
              <button
                key={b.id}
                onClick={() => go(i)}
                aria-label={`Ke slide ${i + 1}`}
                aria-current={i === index}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-7 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/70'}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
