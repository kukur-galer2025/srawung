'use client';

import React, { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { BookCard } from '@/components/BookCard';
import type { BookSummary, Category } from '@/lib/types';

/** Rak buku yang bisa digeser horizontal, dengan tombol panah di desktop. */
export function BookRow({ books, showReason = false }: { books: (BookSummary & { reason?: string })[]; showReason?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.8, behavior: 'smooth' });

  return (
    <div className="group/row relative">
      <div ref={ref} className="no-scrollbar -mx-4 flex snap-x snap-mandatory scroll-px-4 gap-5 overflow-x-auto scroll-smooth px-4 pb-2 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0">
        {books.map((b, i) => (
          <div
            key={b.id}
            className="reveal-item w-[44%] shrink-0 snap-start sm:w-[30%] md:w-[23%] lg:w-[calc((100%-5*1.25rem)/6)]"
            style={{ '--i': i } as React.CSSProperties}
          >
            <BookCard {...b} reason={showReason ? b.reason : undefined} eager={i < 6} />
          </div>
        ))}
      </div>
      {books.length > 6 && (
        <>
          <button
            onClick={() => scroll(-1)}
            aria-label="Geser ke kiri"
            className="absolute -left-5 top-[38%] z-10 hidden h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 opacity-0 shadow-lg transition group-hover/row:opacity-100 hover:text-slate-900 lg:flex"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => scroll(1)}
            aria-label="Geser ke kanan"
            className="absolute -right-5 top-[38%] z-10 hidden h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 opacity-0 shadow-lg transition group-hover/row:opacity-100 hover:text-slate-900 lg:flex"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}

/** Rak dengan tab kategori — filter di sisi klien tanpa memuat ulang. */
export function CategoryShelf({ books, categories }: { books: BookSummary[]; categories: Category[] }) {
  const [active, setActive] = useState('');
  const tabs = [{ slug: '', name: 'Semua' }, ...categories];
  const shown = active ? books.filter((b) => b.category?.slug === active) : books;

  return (
    <div>
      <div role="tablist" aria-label="Kategori" className="no-scrollbar -mx-4 mb-7 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => {
          const selected = active === t.slug;
          return (
            <button
              key={t.slug || 'semua'}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(t.slug)}
              className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition ${
                selected ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">
        <BookRow key={active} books={shown} />
      </div>
    </div>
  );
}
