import { formatRupiah } from '@/lib/utils';
import type { BookSummary } from '@/lib/types';

type PriceInput = Pick<BookSummary, 'price' | 'effective_price' | 'is_on_sale' | 'discount_percent'>;

export function priceOf(book: PriceInput) {
  const onSale = !!book.is_on_sale && book.effective_price !== undefined && book.effective_price < book.price;
  return {
    onSale,
    current: onSale ? (book.effective_price as number) : book.price,
    normal: book.price,
    percent: onSale ? book.discount_percent || Math.round((1 - (book.effective_price as number) / book.price) * 100) : 0,
  };
}

/** Harga dengan harga coret & label diskon bila promo berlaku. */
export function Price({ book, size = 'md', className = '' }: { book: PriceInput; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const { onSale, current, normal, percent } = priceOf(book);
  const main = { sm: 'text-sm', md: 'text-base', lg: 'text-3xl' }[size];
  const sub = { sm: 'text-[11px]', md: 'text-xs', lg: 'text-sm' }[size];

  return (
    <div className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 ${className}`}>
      <span className={`${main} font-bold tracking-tight ${onSale ? 'text-rose-600' : 'text-slate-900'}`}>{formatRupiah(current)}</span>
      {onSale && (
        <span className={`flex items-center gap-1.5 ${sub}`}>
          <span className="text-slate-400 line-through">{formatRupiah(normal)}</span>
          <span className="rounded bg-rose-50 px-1 py-px font-bold text-rose-600 ring-1 ring-inset ring-rose-100">-{percent}%</span>
        </span>
      )}
    </div>
  );
}
