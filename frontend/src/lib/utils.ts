export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

/** URL sampul absolut (bisa dipakai di server maupun client component). */
export function resolveCover(cover_url: string | null | undefined): string | null {
  if (!cover_url) return null;
  if (cover_url.startsWith('http') || cover_url.startsWith('blob:')) return cover_url;
  const base = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api').replace(/\/api\/?$/, '');
  return `${base}${cover_url.startsWith('/') ? '' : '/'}${cover_url}`;
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date(date));
  } catch {
    return date;
  }
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '-';
  try {
    return new Intl.DateTimeFormat('id-ID', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  } catch {
    return date;
  }
}

export function getOrderStatusLabel(status: string): { label: string; color: string } {
  const map: Record<string, { label: string; color: string }> = {
    menunggu_pembayaran: { label: 'Menunggu Pembayaran', color: 'bg-jade-100 text-amber-800 border-jade-200' },
    menunggu_verifikasi: { label: 'Menunggu Verifikasi', color: 'bg-blue-100 text-blue-800 border-blue-200' },
    dikonfirmasi: { label: 'Dikonfirmasi', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
    ditolak: { label: 'Ditolak', color: 'bg-rose-100 text-rose-800 border-rose-200' },
    kedaluwarsa: { label: 'Kedaluwarsa', color: 'bg-slate-100 text-slate-800 border-slate-200' },
  };
  return map[status] || { label: status, color: 'bg-slate-100 text-slate-800 border-slate-200' };
}

/** Nilai kupon untuk ditampilkan: "10%" atau "Rp 20.000". Aman dipakai di server maupun client. */
export function couponValue(c: { type: string; value: number }): string {
  return c.type === 'percent' ? `${c.value}%` : formatRupiah(c.value);
}
