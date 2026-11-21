'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { pushRecentBook } from '@/lib/reader-prefs';

/** Mencatat kunjungan halaman buku: riwayat di browser + sinyal tren di server. */
export function BookViewTracker({ id, slug }: { id: number; slug: string }) {
  useEffect(() => {
    pushRecentBook(id);
    api.post(`/books/${encodeURIComponent(slug)}/view`, {}).catch(() => {
      /* sinyal opsional — abaikan bila gagal */
    });
  }, [id, slug]);

  return null;
}
