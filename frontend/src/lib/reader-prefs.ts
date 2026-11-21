'use client';

import { useSyncExternalStore } from 'react';

/*
 * Sinyal preferensi pembaca yang disimpan di browser (tanpa login):
 *  - riwayat buku yang terakhir dilihat
 *  - topik favorit tamu
 * Dibaca lewat useSyncExternalStore: aman untuk hydration & sinkron antar tab.
 */

const RECENT_KEY = 'amania_recent_books';
const PREFS_KEY = 'amania_topic_prefs';
const MAX_RECENT = 20;
const EMPTY: number[] = [];

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: number[] }>();

function readIds(key: string): number[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return EMPTY;
  }
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value;
  let value = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    value = Array.isArray(parsed) ? parsed.map(Number).filter((n) => Number.isInteger(n) && n > 0) : EMPTY;
  } catch {
    value = EMPTY;
  }
  cache.set(key, { raw, value });
  return value;
}

function writeIds(key: string, ids: number[]) {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage diblokir */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => (e.key === RECENT_KEY || e.key === PREFS_KEY) && cb();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

/** Catat buku yang dilihat (paling baru di depan). */
export function pushRecentBook(id: number) {
  const next = [id, ...readIds(RECENT_KEY).filter((x) => x !== id)].slice(0, MAX_RECENT);
  writeIds(RECENT_KEY, next);
}

export function clearRecentBooks() {
  writeIds(RECENT_KEY, []);
}

export function setGuestTopics(ids: number[]) {
  writeIds(PREFS_KEY, Array.from(new Set(ids)));
}

/** `null` saat render server / sebelum hydration. */
export function useRecentBooks(): number[] | null {
  return useSyncExternalStore(subscribe, () => readIds(RECENT_KEY), () => null);
}

export function useGuestTopics(): number[] | null {
  return useSyncExternalStore(subscribe, () => readIds(PREFS_KEY), () => null);
}
