'use client';

import { useState } from 'react';
import { Check, Copy, Ticket } from 'lucide-react';
import { couponValue, formatDate } from '@/lib/utils';
import { toast } from '@/lib/dialog';
import type { PublicCoupon } from '@/lib/types';

export { couponValue };

/** Kupon bergaya tiket dengan tombol salin kode. */
export function CouponCard({ coupon, compact = false }: { coupon: PublicCoupon; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      toast.success(`Kode ${coupon.code} disalin. Tempel di halaman keranjang.`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.info(`Kode kupon: ${coupon.code}`);
    }
  };

  return (
    <div className="relative flex overflow-hidden rounded-2xl border border-jade-200 bg-linear-to-br from-amber-50 to-orange-50">
      {/* Sisi nilai diskon */}
      <div className={`flex shrink-0 flex-col items-center justify-center bg-linear-to-br from-jade-400 to-orange-500 text-amber-950 ${compact ? 'w-24 px-2' : 'w-28 px-3 sm:w-32'}`}>
        <Ticket className="mb-1 h-4 w-4 opacity-70" />
        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-80">Hemat</span>
        <span className={`font-display font-semibold leading-none ${compact ? 'text-xl' : 'text-2xl'}`}>{couponValue(coupon)}</span>
      </div>

      {/* Sobekan tiket */}
      <span aria-hidden className="absolute -top-2.5 left-[5.75rem] h-5 w-5 rounded-full border border-jade-200 bg-white sm:left-[7.25rem]" />
      <span aria-hidden className="absolute -bottom-2.5 left-[5.75rem] h-5 w-5 rounded-full border border-jade-200 bg-white sm:left-[7.25rem]" />

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 border-l-2 border-dashed border-jade-300/80 p-4">
        <div className="flex items-center justify-between gap-3">
          <code className="truncate rounded-md bg-white px-2 py-1 font-mono text-sm font-bold tracking-wider text-slate-900 ring-1 ring-jade-200">{coupon.code}</code>
          <button
            onClick={copy}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition ${
              copied ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Disalin' : 'Salin'}
          </button>
        </div>
        {coupon.description && !compact && <p className="text-xs leading-relaxed text-slate-600">{coupon.description}</p>}
        <p className="text-[11px] text-slate-500">
          {coupon.expires_at ? `Berlaku s.d. ${formatDate(coupon.expires_at)}` : 'Tanpa batas waktu'}
          {coupon.remaining !== null && ` · sisa ${coupon.remaining} kuota`}
        </p>
      </div>
    </div>
  );
}
