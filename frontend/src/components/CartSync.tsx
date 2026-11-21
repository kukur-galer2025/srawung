'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart, type CartItem } from '@/contexts/CartContext';
import { api } from '@/lib/api';
import type { CartLine } from '@/lib/types';

/**
 * Menyalin keranjang (localStorage) ke server untuk pembeli yang login:
 *  - pengingat "keranjang tertinggal" lewat email,
 *  - keranjang ikut pindah perangkat: login di perangkat baru dengan keranjang
 *    kosong → isi diambil dari server.
 */
export function CartSync() {
  const { user } = useAuth();
  const { items, bookIds, bundleIds, replaceAll } = useCart();
  const restoredFor = useRef<number | null>(null);
  const lastSent = useRef<string>('');

  // 1) Saat login: pulihkan dari server bila keranjang di perangkat ini kosong.
  useEffect(() => {
    if (!user || restoredFor.current === user.id) return;
    restoredFor.current = user.id;
    if (items.length > 0) return; // keranjang lokal menang → akan dikirim oleh effect di bawah

    api
      .get('/cart')
      .then((res: { lines: CartLine[] }) => {
        const restored: CartItem[] = (res.lines ?? [])
          .filter((l) => l.available)
          .map((l) => ({ type: l.type, id: l.id, title: l.title, author: l.author, price: l.price, slug: l.slug, cover_url: l.cover_url }));
        if (restored.length) {
          lastSent.current = key(restored.filter((i) => i.type === 'book').map((i) => i.id), restored.filter((i) => i.type === 'bundle').map((i) => i.id));
          replaceAll(restored);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // 2) Setiap isi berubah: kirim salinan ke server (dengan jeda agar tidak boros request).
  useEffect(() => {
    if (!user || restoredFor.current !== user.id) return;
    const k = key(bookIds, bundleIds);
    if (k === lastSent.current) return;
    const t = setTimeout(() => {
      lastSent.current = k;
      api.put('/cart', { book_ids: bookIds, bundle_ids: bundleIds }).catch(() => {
        lastSent.current = '';
      });
    }, 800);
    return () => clearTimeout(t);
  }, [user, bookIds, bundleIds]);

  return null;
}

const key = (books: number[], bundles: number[]) => `${[...books].sort().join(',')}|${[...bundles].sort().join(',')}`;
