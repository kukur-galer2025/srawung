'use client';

import { useSyncExternalStore } from 'react';

/*
 * Jam global yang berdetak tiap detik. Lewat useSyncExternalStore, server merender
 * placeholder (null) sehingga tidak ada hydration mismatch karena selisih waktu.
 */
const listeners = new Set<() => void>();
let now = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const getSnapshot = () => now || Date.now();
const getServerSnapshot = () => null;

const pad = (n: number) => String(n).padStart(2, '0');

/** Hitung mundur ke `until`. Varian "boxes" untuk banner promo, "inline" untuk teks. */
export function Countdown({ until, variant = 'boxes', endedText = 'Promo telah berakhir' }: { until: string; variant?: 'boxes' | 'inline'; endedText?: string }) {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const end = new Date(until).getTime();

  if (current === null || Number.isNaN(end)) {
    return <span className="inline-block h-8 w-40 animate-pulse rounded-md bg-current/10" aria-hidden />;
  }

  const diff = Math.max(0, end - current);
  if (diff === 0) return <span className="text-sm font-semibold">{endedText}</span>;

  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1000);

  if (variant === 'inline') {
    return (
      <span className="tabular-nums">
        {days > 0 && `${days} hari `}
        {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    );
  }

  const parts = [
    ...(days > 0 ? [{ v: days, l: 'Hari' }] : []),
    { v: hours, l: 'Jam' },
    { v: minutes, l: 'Mnt' },
    { v: seconds, l: 'Dtk' },
  ];

  return (
    <span className="flex items-center gap-1.5" role="timer" aria-label={`Berakhir dalam ${days} hari ${hours} jam ${minutes} menit`}>
      {parts.map((p, i) => (
        <span key={p.l} className="flex items-center gap-1.5">
          <span className="flex min-w-11 flex-col items-center rounded-lg bg-white px-2 py-1 text-slate-900 shadow-sm">
            <span className="font-display text-lg font-semibold leading-tight tabular-nums">{pad(p.v)}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{p.l}</span>
          </span>
          {i < parts.length - 1 && <span className="font-bold opacity-60">:</span>}
        </span>
      ))}
    </span>
  );
}
