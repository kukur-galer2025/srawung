'use client';

import useSWR from 'swr';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Heart, HeartOff, LogIn } from 'lucide-react';
import { showFlash } from '@/lib/flash';
import { track } from '@/lib/analytics';

/**
 * Wishlist pembaca. Daftar ID dimuat sekali (SWR, dibagi ke semua kartu buku),
 * lalu diperbarui secara optimistis saat tombol hati ditekan.
 */
export function useWishlist() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { data, mutate } = useSWR<number[]>(user ? '/wishlist/ids' : null, (url: string) => api.get(url), {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const ids = Array.isArray(data) ? data : [];

  const has = (bookId: number) => ids.includes(bookId);

  /** Tambah/hapus satu buku. Memakai data SWR terkini (bukan salinan saat render) agar "Urungkan" selalu tepat. */
  const setWished = async (bookId: number, add: boolean, title?: string) => {
    const apply = (cur?: number[]) => {
      const list = Array.isArray(cur) ? cur.filter((id) => id !== bookId) : [];
      return add ? [...list, bookId] : list;
    };
    await mutate(
      async (cur) => {
        if (add) await api.post(`/wishlist/${bookId}`, {});
        else await api.delete(`/wishlist/${bookId}`);
        return apply(cur);
      },
      { optimisticData: (cur) => apply(cur), rollbackOnError: true, revalidate: false }
    ).then(
      () => {
        if (add) {
          showFlash({
            tone: 'success',
            icon: Heart,
            title: 'Disimpan ke wishlist',
            description: `${title ? `${title} · ` : ''}kami kabari lewat email saat buku ini promo.`,
            actions: [{ label: 'Lihat wishlist', href: '/wishlist', primary: true }],
          });
          track('add_to_wishlist', { item_id: bookId, item_name: title });
        } else {
          showFlash({
            tone: 'info',
            icon: HeartOff,
            title: 'Dihapus dari wishlist',
            description: title,
            actions: [{ label: 'Urungkan', primary: true, onClick: () => void setWished(bookId, true, title) }],
          });
        }
      },
      (err: unknown) => showFlash({ tone: 'error', title: 'Wishlist gagal diperbarui', description: err instanceof Error ? err.message : 'Coba lagi sebentar lagi.' })
    );
  };

  const toggle = async (bookId: number, title?: string) => {
    if (!user) {
      showFlash({ tone: 'info', icon: LogIn, title: 'Masuk dulu untuk menyimpan wishlist', description: 'Setelah masuk, Anda akan kembali ke halaman ini.' });
      router.push(`/masuk?redirect=${encodeURIComponent(pathname || '/')}`);
      return;
    }
    await setWished(bookId, !has(bookId), title);
  };

  return { ids, has, toggle, ready: !!user && data !== undefined };
}
