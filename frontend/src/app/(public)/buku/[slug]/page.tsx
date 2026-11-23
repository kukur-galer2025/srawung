import type { Metadata } from 'next';
import Link from 'next/link';
import { jsonLdHtml } from '@/lib/jsonld';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { BookDetailClient, type BookDetailData } from './BookDetailClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

async function getBookBySlug(slug: string): Promise<BookDetailData | null> {
  try {
    const res = await fetch(`${API_URL}/books/${encodeURIComponent(slug)}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || json;
  } catch {
    return null;
  }
}

/** Rekomendasi dari mesin rekomendasi (kemiripan isi, pembeli juga membeli, kategori, tren). */
async function getRelated(slug: string) {
  try {
    const res = await fetch(`${API_URL}/books/${encodeURIComponent(slug)}/similar`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data ?? []) as (BookDetailData & { reason?: string })[];
  } catch {
    return [];
  }
}

function absoluteCover(url: string | null | undefined) {
  if (!url) return undefined;
  return url.startsWith('http') ? url : `${API_URL.replace(/\/api\/?$/, '')}${url.startsWith('/') ? '' : '/'}${url}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const book = await getBookBySlug(slug);
  if (!book) return { title: 'Buku tidak ditemukan' };

  const description = book.synopsis ? book.synopsis.slice(0, 160) : `Beli dan baca ${book.title} karya ${book.author} di Srawung.`;
  const cover = absoluteCover(book.cover_url);
  return {
    title: `${book.title} — ${book.author}`,
    description,
    openGraph: { title: `${book.title} | Srawung`, description, images: cover ? [{ url: cover }] : [], type: 'book' },
  };
}

export default async function BookDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const book = await getBookBySlug(slug);
  if (!book) notFound();

  const related = await getRelated(book.slug);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Book',
    name: book.title,
    author: { '@type': 'Person', name: book.author },
    description: book.synopsis,
    image: absoluteCover(book.cover_url),
    numberOfPages: book.total_pages,
    inLanguage: 'id',
    ...(book.rating_count
      ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: book.rating_avg, reviewCount: book.rating_count, bestRating: 5, worstRating: 1 } }
      : {}),
    offers: { '@type': 'Offer', price: book.effective_price ?? book.price, priceCurrency: 'IDR', availability: 'https://schema.org/InStock' },
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(jsonLd) }} />

      <nav aria-label="Breadcrumb" className="no-scrollbar mb-8 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap text-sm text-slate-500">
        <Link href="/" className="transition hover:text-slate-900">
          Beranda
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <Link href="/buku" className="transition hover:text-slate-900">
          Katalog
        </Link>
        {book.category && (
          <>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
            <Link href={`/buku?category=${book.category.slug}`} className="transition hover:text-slate-900">
              {book.category.name}
            </Link>
          </>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
        <span className="max-w-[220px] truncate font-medium text-slate-900">{book.title}</span>
      </nav>

      <BookDetailClient book={book} related={related} />
    </div>
  );
}
