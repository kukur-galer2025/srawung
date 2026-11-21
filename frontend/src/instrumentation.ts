import type { Instrumentation } from 'next';

/*
 * Instrumentasi server Next.js (render halaman di server).
 * Sentry aktif bila SENTRY_DSN atau NEXT_PUBLIC_SENTRY_DSN diisi; bila tidak,
 * error render server dikirim ke backend Laravel → log + email admin.
 */
const DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || '';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export async function register() {
  if (!DSN) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn: DSN,
    environment: process.env.NODE_ENV,
    // Privasi: jangan kirim data pengguna, cookie, header, isi request, atau query string.
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
  });
}

export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (DSN) {
    const Sentry = await import('@sentry/nextjs');
    Sentry.captureRequestError(err, request, context);
    return;
  }
  if (process.env.NODE_ENV !== 'production') return;

  const error = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === 'object' && err !== null && 'digest' in err ? String((err as { digest: unknown }).digest) : undefined;
  try {
    await fetch(`${API_URL}/client-errors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        message: `${error.name}: ${error.message}`.slice(0, 2000),
        stack: error.stack?.slice(0, 4000),
        digest,
        url: request.path.split('?')[0],
        source: 'next-server',
      }),
    });
  } catch {
    /* backend tidak terjangkau — abaikan */
  }
};
