'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, type LucideIcon } from 'lucide-react';
import { BookCover } from '@/components/BookCard';
import { dismissFlash, flashStore, type FlashItem, type FlashTone } from '@/lib/flash';

const TONE: Record<FlashTone, { icon: LucideIcon; badge: string; bar: string; ring: string }> = {
  success: { icon: CheckCircle2, badge: 'bg-emerald-500 text-white', bar: 'bg-emerald-500', ring: 'ring-emerald-500/15' },
  error: { icon: AlertCircle, badge: 'bg-rose-500 text-white', bar: 'bg-rose-500', ring: 'ring-rose-500/20' },
  info: { icon: Info, badge: 'bg-navy text-jade-200', bar: 'bg-navy', ring: 'ring-slate-900/10' },
  warning: { icon: AlertTriangle, badge: 'bg-jade-400 text-slate-950', bar: 'bg-jade-400', ring: 'ring-jade-500/20' },
};

/** Tumpukan flash message — dipasang sekali di layout root. */
export function FlashHost() {
  const items = useSyncExternalStore(flashStore.subscribe, flashStore.get, flashStore.getServer);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 top-3 z-[80] flex flex-col items-center gap-2.5 sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-24 sm:flex-col-reverse sm:items-end"
    >
      {items.map((item) => (
        <FlashCard key={item.id} item={item} />
      ))}
    </div>
  );
}

function FlashCard({ item }: { item: FlashItem }) {
  const [leaving, setLeaving] = useState(false);
  const tone = TONE[item.tone];
  const Icon = item.icon ?? tone.icon;

  const close = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => dismissFlash(item.id), 220);
  };

  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={`flash-card group pointer-events-auto relative w-full max-w-[24rem] overflow-hidden rounded-2xl bg-white/95 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.45)] ring-1 backdrop-blur-xl ${tone.ring} ${
        leaving ? 'flash-out' : 'flash-in'
      }`}
    >
      <div className="flex items-start gap-3.5 p-3.5 pr-10">
        {item.image ? (
          <span className="relative mt-0.5 aspect-[3/4.3] w-11 shrink-0 overflow-hidden rounded-md shadow-[0_8px_18px_-8px_rgba(15,23,42,0.6)] ring-1 ring-slate-900/5">
            <BookCover title={item.image.title} src={item.image.src} sizes="48px" />
            <span className={`absolute -bottom-px -right-px flex h-5 w-5 items-center justify-center rounded-tl-lg ${tone.badge}`}>
              <Icon className="h-3 w-3" strokeWidth={2.5} />
            </span>
          </span>
        ) : (
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.badge}`}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}

        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-sm leading-snug font-semibold text-slate-900">{item.title}</p>
          {item.description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-slate-500">{item.description}</p>}
          {item.actions && item.actions.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
              {item.actions.map((a) => {
                const cls = a.primary
                  ? 'inline-flex h-8 items-center rounded-full bg-navy-deep px-3.5 text-xs font-semibold text-white transition hover:bg-navy'
                  : 'text-xs font-semibold text-slate-600 underline-offset-4 transition hover:text-slate-950 hover:underline';
                return a.href ? (
                  <Link key={a.label} href={a.href} onClick={close} className={cls}>
                    {a.label}
                  </Link>
                ) : (
                  <button
                    key={a.label}
                    onClick={() => {
                      a.onClick?.();
                      close();
                    }}
                    className={cls}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <button
        onClick={close}
        aria-label="Tutup notifikasi"
        className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Bilah waktu: berhenti saat kursor di atas kartu, lalu menutup kartu saat habis. */}
      <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-slate-100">
        <span
          className={`flash-timer block h-full origin-left ${tone.bar} group-hover:[animation-play-state:paused]`}
          style={{ animationDuration: `${item.duration}ms` }}
          onAnimationEnd={close}
        />
      </span>
    </div>
  );
}
