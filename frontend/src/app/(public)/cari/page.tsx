import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SearchClient } from './SearchClient';

export const metadata: Metadata = {
  title: 'Cari di dalam buku',
  description: 'Cari topik, istilah, atau soal di dalam isi semua e-book Srawung — langsung tahu buku dan halaman mana yang membahasnya.',
};

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="mx-auto my-16 h-96 max-w-5xl animate-pulse rounded-3xl bg-slate-100" />}>
      <SearchClient />
    </Suspense>
  );
}
