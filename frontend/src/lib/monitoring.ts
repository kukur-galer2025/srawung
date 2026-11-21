/**
 * Pelaporan error frontend.
 *
 *  - NEXT_PUBLIC_SENTRY_DSN diisi → dikirim ke Sentry (stack trace, peramban, halaman).
 *  - Kosong → dikirim ke backend (/api/client-errors) → log + email peringatan admin.
 *
 * Tidak ada data pribadi yang dikirim: hanya pesan error, stack, dan path halaman.
 */
export const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN || '';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const MAX_PER_PAGE = 5;
let sent = 0;
const seen = new Set<string>();

function normalize(error: unknown): { message: string; stack?: string; digest?: string } {
  if (error instanceof Error) {
    return { message: `${error.name}: ${error.message}`, stack: error.stack, digest: (error as Error & { digest?: string }).digest };
  }
  return { message: typeof error === 'string' ? error : JSON.stringify(error)?.slice(0, 500) ?? 'Unknown error' };
}

export async function reportError(error: unknown, extra?: { digest?: string }) {
  if (typeof window === 'undefined') return;

  if (SENTRY_DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureException(error, extra?.digest ? { tags: { digest: extra.digest } } : undefined);
    return;
  }

  // Tanpa Sentry, hanya catat error di produksi (di mode dev sudah terlihat di layar).
  if (process.env.NODE_ENV !== 'production') return;

  const info = normalize(error);
  const key = info.message.slice(0, 200);
  if (seen.has(key) || sent >= MAX_PER_PAGE) return;
  seen.add(key);
  sent++;

  try {
    await fetch(`${API_URL}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        message: info.message.slice(0, 2000),
        stack: info.stack?.slice(0, 4000),
        digest: extra?.digest ?? info.digest,
        url: window.location.origin + window.location.pathname,
        source: 'browser',
      }),
      keepalive: true,
    });
  } catch {
    /* jaringan putus — abaikan */
  }
}
