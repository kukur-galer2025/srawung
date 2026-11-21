'use client';

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, ReactNode } from 'react';
import { ShoppingBag, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { showFlash } from '@/lib/flash';
import { formatRupiah } from '@/lib/utils';

export interface CartItem {
  /** 'book' (bawaan, untuk data lama di localStorage) atau 'bundle' (paket hemat). */
  type?: 'book' | 'bundle';
  id: number;
  title: string;
  author: string;
  price: number;
  slug: string;
  cover_url: string | null;
}

interface CartContextType {
  items: CartItem[];
  /** `silent`: tanpa flash message (mis. "Beli sekarang" yang langsung membuka keranjang). */
  addItem: (item: CartItem, opts?: { silent?: boolean }) => void;
  removeItem: (id: number, type?: 'book' | 'bundle', opts?: { silent?: boolean }) => void;
  replaceAll: (items: CartItem[]) => void;
  clearCart: () => void;
  hasItem: (id: number) => boolean;
  hasBundle: (id: number) => boolean;
  bookIds: number[];
  bundleIds: number[];
  total: number;
  itemCount: number;
}

const KEY = 'amania_cart';
const EMPTY: CartItem[] = [];

export const itemType = (i: CartItem) => i.type ?? 'book';
const same = (a: CartItem, id: number, type: 'book' | 'bundle') => a.id === id && itemType(a) === type;

/*
 * Keranjang disimpan di localStorage dan dibaca lewat useSyncExternalStore:
 * aman untuk hydration (server selalu kosong) dan otomatis sinkron antar tab.
 * Salinannya dikirim ke server oleh <CartSync/> untuk pengingat & pindah perangkat.
 */
const listeners = new Set<() => void>();
let cachedRaw: string | null = null;
let cachedItems: CartItem[] = EMPTY;

function read(): CartItem[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    cachedItems = Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    cachedItems = EMPTY;
  }
  return cachedItems;
}

function write(items: CartItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {
    /* storage penuh / diblokir */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

const CartContext = createContext<CartContextType>({} as CartContextType);

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);

  const addItem = useCallback((item: CartItem, opts?: { silent?: boolean }) => {
    const current = read();
    const exists = current.some((i) => same(i, item.id, itemType(item)));
    if (!exists) write([...current, item]);
    if (opts?.silent) return;
    // Analitik kreator: catat "masuk keranjang" (tanpa data pribadi; gagal pun tidak masalah).
    if (!exists && itemType(item) === 'book' && item.slug) {
      api.post(`/books/${encodeURIComponent(item.slug)}/cart-event`, {}).catch(() => {});
    }

    const label = itemType(item) === 'bundle' ? 'Paket' : 'Buku';
    showFlash(
      exists
        ? {
            tone: 'info',
            icon: ShoppingBag,
            title: `${label} ini sudah ada di keranjang`,
            description: item.title,
            image: { src: item.cover_url, title: item.title },
            actions: [{ label: 'Buka keranjang', href: '/keranjang', primary: true }],
          }
        : {
            tone: 'success',
            icon: ShoppingBag,
            title: `${label} masuk keranjang`,
            description: `${item.title} · ${formatRupiah(item.price)}`,
            image: { src: item.cover_url, title: item.title },
            actions: [
              { label: `Lihat keranjang (${current.length + 1})`, href: '/keranjang', primary: true },
              { label: 'Urungkan', onClick: () => write(read().filter((i) => !same(i, item.id, itemType(item)))) },
            ],
          }
    );
  }, []);

  const removeItem = useCallback((id: number, type: 'book' | 'bundle' = 'book', opts?: { silent?: boolean }) => {
    const current = read();
    const index = current.findIndex((i) => same(i, id, type));
    if (index === -1) return;
    const removed = current[index];
    write(current.filter((_, i) => i !== index));
    if (opts?.silent) return;

    showFlash({
      tone: 'info',
      icon: Trash2,
      title: `${type === 'bundle' ? 'Paket' : 'Buku'} dihapus dari keranjang`,
      description: removed.title,
      image: { src: removed.cover_url, title: removed.title },
      actions: [
        {
          label: 'Urungkan',
          primary: true,
          // Kembalikan ke posisi semula.
          onClick: () => {
            const now = read();
            if (now.some((i) => same(i, id, type))) return;
            const next = [...now];
            next.splice(Math.min(index, next.length), 0, removed);
            write(next);
          },
        },
      ],
    });
  }, []);
  const replaceAll = useCallback((next: CartItem[]) => write(next), []);
  const clearCart = useCallback(() => write([]), []);

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      replaceAll,
      clearCart,
      hasItem: (id: number) => items.some((i) => same(i, id, 'book')),
      hasBundle: (id: number) => items.some((i) => same(i, id, 'bundle')),
      bookIds: items.filter((i) => itemType(i) === 'book').map((i) => i.id),
      bundleIds: items.filter((i) => itemType(i) === 'bundle').map((i) => i.id),
      total: items.reduce((sum, i) => sum + (Number(i.price) || 0), 0),
      itemCount: items.length,
    }),
    [items, addItem, removeItem, replaceAll, clearCart]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
