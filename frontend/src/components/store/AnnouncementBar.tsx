import Link from 'next/link';
import { ArrowRight, Zap } from 'lucide-react';
import { fetchPublic } from '@/lib/server-api';
import { formatDate } from '@/lib/utils';
import type { BookSummary, PublicCoupon } from '@/lib/types';

/** Bar pengumuman di atas navbar — isinya otomatis dari promo/kupon yang sedang berlaku. */
export async function AnnouncementBar() {
  const promo = await fetchPublic<{ books: BookSummary[]; coupons: PublicCoupon[] }>('/promo', 120);
  if (!promo) return null;

  const books = promo.books ?? [];
  const coupon = promo.coupons?.[0];
  let text: string | null = null;
  let short: string | null = null; // versi pendek untuk layar HP (tanpa terpotong di tengah kata)

  if (books.length) {
    const max = Math.max(...books.map((b) => b.discount_percent ?? 0));
    const ends = books
      .map((b) => b.sale_ends_at)
      .filter((d): d is string => !!d)
      .sort()[0];
    text = `Promo spesial: diskon hingga ${max}% untuk ${books.length} buku${ends ? ` · berakhir ${formatDate(ends)}` : ''}`;
    short = `Diskon hingga ${max}% untuk ${books.length} buku`;
  } else if (coupon) {
    text = `Pakai kode ${coupon.code} untuk hemat ${coupon.type === 'percent' ? `${coupon.value}%` : `Rp ${coupon.value.toLocaleString('id-ID')}`}`;
    short = text;
  }

  if (!text) return null;

  return (
    <Link
      href="/promo"
      className="group relative block overflow-hidden bg-linear-to-r from-slate-950 via-blue-950 to-slate-950 text-white"
    >
      <div className="mx-auto flex h-9 max-w-7xl items-center justify-center gap-2 px-4 text-center text-xs font-medium sm:text-[13px]">
        <Zap className="h-3.5 w-3.5 shrink-0 fill-jade-300 text-jade-300" />
        <span className="hidden min-w-0 truncate sm:inline">{text}</span>
        <span className="min-w-0 truncate sm:hidden">{short ?? text}</span>
        <span className="inline-flex shrink-0 items-center gap-0.5 font-bold text-jade-300">
          <span className="hidden sm:inline">Lihat promo</span>
          <span className="sm:hidden">Lihat</span>
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}
