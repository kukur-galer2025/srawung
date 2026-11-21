import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PenLine } from 'lucide-react';
import { BookCard } from '@/components/BookCard';
import { fetchPublic } from '@/lib/server-api';
import type { BookSummary } from '@/lib/types';

interface CreatorPage {
  display_name: string;
  slug: string;
  bio: string | null;
  books_count: number;
  books: BookSummary[];
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await fetchPublic<CreatorPage>(`/creators/${slug}`, 120);
  if (!c) return { title: 'Kreator tidak ditemukan' };
  return { title: `${c.display_name} — buku di Srawung`, description: c.bio ?? `${c.books_count} buku karya ${c.display_name} di Srawung.` };
}

export default async function CreatorPublicPage({ params }: Props) {
  const { slug } = await params;
  const c = await fetchPublic<CreatorPage>(`/creators/${slug}`, 120);
  if (!c) notFound();

  const initials = c.display_name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="bg-white pb-20">
      <section className="border-b border-slate-200 bg-[#f7f5f0]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-center sm:px-6 lg:px-8 lg:py-16">
          <span className="rise flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-navy font-display text-2xl font-semibold text-white ring-4 ring-white">{initials}</span>
          <div className="min-w-0">
            <p className="eyebrow rise mb-2">
              <PenLine className="h-3.5 w-3.5" />
              Kreator Srawung
            </p>
            <h1 className="rise delay-1 font-display text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{c.display_name}</h1>
            {c.bio && <p className="rise delay-2 mt-3 max-w-2xl whitespace-pre-line leading-relaxed text-slate-600">{c.bio}</p>}
            <p className="mt-3 text-sm text-slate-500">{c.books_count} buku</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
        {c.books.length ? (
          <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:grid-cols-3 lg:grid-cols-5">
            {c.books.map((b, i) => (
              <div key={b.id} className="reveal-item" style={{ ['--i' as string]: i }}>
                <BookCard {...b} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-slate-500">Belum ada buku yang dijual.</p>
        )}
      </section>
    </div>
  );
}
