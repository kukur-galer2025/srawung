'use client';

import React from 'react';
import { Heart } from 'lucide-react';
import { useWishlist } from '@/lib/wishlist';

/** Tombol hati untuk menyimpan buku ke wishlist. */
export function WishlistButton({
  bookId,
  title,
  variant = 'floating',
  className = '',
}: {
  bookId: number;
  title?: string;
  variant?: 'floating' | 'outline';
  className?: string;
}) {
  const { has, toggle } = useWishlist();
  const saved = has(bookId);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    void toggle(bookId, title);
  };

  if (variant === 'outline') {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        className={`flex h-12 w-full items-center justify-center gap-2 rounded-full border text-[15px] font-semibold transition duration-300 ${
          saved ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50'
        } ${className}`}
      >
        <Heart className={`h-[18px] w-[18px] transition-transform duration-300 ${saved ? 'scale-110 fill-current' : ''}`} />
        {saved ? 'Ada di wishlist' : 'Simpan ke wishlist'}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Hapus ${title ?? 'buku'} dari wishlist` : `Simpan ${title ?? 'buku'} ke wishlist`}
      title={saved ? 'Hapus dari wishlist' : 'Simpan ke wishlist'}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/95 shadow-md backdrop-blur transition duration-300 ease-luxe hover:scale-110 ${
        saved ? 'text-rose-500' : 'text-slate-600 hover:text-rose-500'
      } ${className}`}
    >
      <Heart className={`h-[17px] w-[17px] ${saved ? 'fill-current' : ''}`} />
    </button>
  );
}
