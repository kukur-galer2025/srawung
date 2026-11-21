import { Suspense } from 'react';
import type { Metadata } from 'next';
import { CatalogClient } from './CatalogClient';
import { BookCardSkeleton } from '@/components/LoadingSkeleton';

export const metadata: Metadata = {
  title: 'Katalog Buku Digital Lengkap',
  description: 'Jelajahi buku digital Amania Press: pemrograman, AI, desain, dan persiapan ujian. Baca pratinjau gratis sebelum membeli.',
  openGraph: {
    title: 'Katalog Buku Digital Lengkap | Srawung',
    description: 'Jelajahi buku digital Amania Press: pemrograman, AI, desain, dan persiapan ujian. Baca pratinjau gratis sebelum membeli.',
    type: 'website',
  },
};

export default function BooksPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-[#fbfaf7] pb-24">
          <div className="h-[26rem] bg-navy-deep" />
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 pt-12 sm:px-6 md:grid-cols-4 lg:px-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <BookCardSkeleton key={i} />
            ))}
          </div>
        </div>
      }
    >
      <CatalogClient />
    </Suspense>
  );
}
