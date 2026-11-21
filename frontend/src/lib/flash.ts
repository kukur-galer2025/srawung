'use client';

import type { LucideIcon } from 'lucide-react';

/*
 * Flash message Srawung — notifikasi ringkas yang muncul di atas halaman.
 * Bisa memuat sampul buku, keterangan, dan tombol aksi (mis. "Lihat keranjang",
 * "Urungkan"). Ditampilkan oleh <FlashHost/> di layout root.
 */

export type FlashTone = 'success' | 'error' | 'info' | 'warning';

export interface FlashAction {
  label: string;
  href?: string;
  onClick?: () => void;
  /** Tombol utama (terisi); selain itu tampil sebagai tautan teks. */
  primary?: boolean;
}

export interface FlashInput {
  tone?: FlashTone;
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Sampul buku/paket di sisi kiri. */
  image?: { src: string | null; title: string };
  actions?: FlashAction[];
  /** Milidetik sebelum hilang otomatis (bawaan 4,5 detik; error 6 detik). */
  duration?: number;
}

export interface FlashItem extends FlashInput {
  id: number;
  tone: FlashTone;
  duration: number;
}

const MAX = 4;
const NONE: FlashItem[] = [];
let items: FlashItem[] = NONE;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const flashStore = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get: () => items,
  getServer: () => NONE,
};

export function showFlash(input: FlashInput): number {
  const tone = input.tone ?? 'success';
  const item: FlashItem = { ...input, tone, id: ++seq, duration: input.duration ?? (tone === 'error' ? 6000 : 4500) };
  items = [item, ...items].slice(0, MAX);
  emit();
  return item.id;
}

export function dismissFlash(id: number) {
  if (!items.some((i) => i.id === id)) return;
  items = items.filter((i) => i.id !== id);
  emit();
}

export const flash = {
  show: showFlash,
  dismiss: dismissFlash,
  success: (title: string, description?: string) => showFlash({ tone: 'success', title, description }),
  error: (title: string, description?: string) => showFlash({ tone: 'error', title, description }),
  info: (title: string, description?: string) => showFlash({ tone: 'info', title, description }),
  warning: (title: string, description?: string) => showFlash({ tone: 'warning', title, description }),
};
