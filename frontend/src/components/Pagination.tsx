'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function pageList(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, '…', total];
  if (current >= total - 3) return [1, '…', total - 4, total - 3, total - 2, total - 1, total];
  return [1, '…', current - 1, current, current + 1, '…', total];
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const arrow =
    'flex h-10 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav className="my-10 flex items-center justify-center gap-1.5" aria-label="Navigasi halaman">
      <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage <= 1} className={arrow} aria-label="Halaman sebelumnya">
        <ChevronLeft className="h-4 w-4" />
        <span className="hidden sm:inline">Sebelumnya</span>
      </button>

      {pageList(currentPage, totalPages).map((page, idx) =>
        page === '…' ? (
          <span key={`gap-${idx}`} className="px-2 text-slate-400">
            …
          </span>
        ) : (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            aria-current={page === currentPage ? 'page' : undefined}
            className={`hidden h-10 min-w-10 rounded-xl px-3 text-sm font-semibold transition sm:block ${
              page === currentPage ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {page}
          </button>
        )
      )}
      <span className="px-3 text-sm text-slate-500 sm:hidden">
        {currentPage} / {totalPages}
      </span>

      <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage >= totalPages} className={arrow} aria-label="Halaman berikutnya">
        <span className="hidden sm:inline">Berikutnya</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </nav>
  );
}
