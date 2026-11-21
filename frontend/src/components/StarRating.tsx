import { Star } from 'lucide-react';

/** Bintang rating (mendukung setengah bintang secara visual). */
export function Stars({ value, size = 14, className = '' }: { value: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${value.toFixed(1)} dari 5 bintang`} role="img">
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star className="absolute inset-0 text-slate-300" style={{ width: size, height: size }} />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <Star className="fill-amber-400 text-amber-400" style={{ width: size, height: size }} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

/** Ringkas: ★ 4,6 (12) — tampil hanya bila ada ulasan. */
export function RatingBadge({ avg, count, className = '' }: { avg?: number; count?: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] text-slate-500 ${className}`}>
      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
      <span className="font-semibold text-slate-800">{Number(avg ?? 0).toLocaleString('id-ID', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
      <span>({count})</span>
    </span>
  );
}
