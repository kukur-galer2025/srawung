'use client';

import { useCallback, useState } from 'react';

/*
 * Logo resmi SRAWUNG (public/brand, dibuat dari srawung-logo.png lewat
 * `php artisan srawung:brand-assets`):
 *  - "color": monogram S + wordmark hijau tua, untuk latar terang.
 *  - "white": versi putih, untuk latar gelap (aturan pakai di company profile).
 * Selama file logo belum ada, tampil wordmark teks sementara dengan warna merek.
 */
/** Gambar yang gagal dimuat SEBELUM React aktif tidak memicu onError → periksa saat terpasang. */
function useBrokenImage() {
  const [missing, setMissing] = useState(false);
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0) setMissing(true);
  }, []);
  return { missing, ref, onError: () => setMissing(true) };
}

const SRC = {
  logo: { color: '/brand/srawung-logo.webp', white: '/brand/srawung-logo-white.webp' },
  mark: { color: '/brand/srawung-mark.webp', white: '/brand/srawung-mark-white.webp' },
};

function TextWordmark({ variant, height }: { variant: 'color' | 'white'; height: number }) {
  return (
    <span className="inline-flex select-none items-center" style={{ height, gap: height * 0.28 }} aria-label="Srawung">
      <TextMark variant={variant} size={height} />
      <span
        className={`font-display font-bold leading-none tracking-[0.06em] ${variant === 'white' ? 'text-white' : 'text-navy'}`}
        style={{ fontSize: height * 0.72 }}
      >
        SRAWUNG
      </span>
    </span>
  );
}

function TextMark({ variant, size }: { variant: 'color' | 'white'; size: number }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-[22%] font-display font-bold leading-none ${
        variant === 'white' ? 'bg-white text-navy' : 'bg-linear-to-br from-jade-400 to-navy text-white'
      }`}
      style={{ width: size, height: size, fontSize: size * 0.62 }}
    >
      S
    </span>
  );
}

export function Logo({ variant = 'color', height = 32, priority = false, className = '' }: { variant?: 'color' | 'white'; height?: number; priority?: boolean; className?: string }) {
  const { missing, ref, onError } = useBrokenImage();
  if (missing) {
    return (
      <span className={className}>
        <TextWordmark variant={variant} height={height} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo kecil statis; lebar mengikuti rasio file asli
    <img
      src={SRC.logo[variant]}
      alt="Srawung"
      height={height}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
      draggable={false}
      ref={ref}
      onError={onError}
      className={`w-auto select-none ${className}`}
      style={{ height }}
    />
  );
}

export function LogoMark({ variant = 'color', size = 32, className = '' }: { variant?: 'color' | 'white'; size?: number; className?: string }) {
  const { missing, ref, onError } = useBrokenImage();
  if (missing) {
    return (
      <span className={className}>
        <TextMark variant={variant} size={size} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- monogram kecil statis
    <img
      src={SRC.mark[variant]}
      alt="Srawung"
      height={size}
      decoding="async"
      draggable={false}
      ref={ref}
      onError={onError}
      className={`w-auto select-none ${className}`}
      style={{ height: size }}
    />
  );
}
