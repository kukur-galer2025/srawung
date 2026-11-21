/*
 * Dijalankan Next.js di peramban sebelum halaman interaktif.
 * Sentry hanya dimuat bila NEXT_PUBLIC_SENTRY_DSN diisi (tidak menambah ukuran
 * halaman bila tidak dipakai). Tanpa Sentry, error dikirim ke backend.
 */
import { reportError, SENTRY_DSN } from '@/lib/monitoring';

if (SENTRY_DSN) {
  import('@sentry/nextjs').then((Sentry) => {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV,
      // Privasi: jangan kirim data pengguna, cookie, header, isi request, atau query string.
      dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
      tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0),
      // Abaikan derau yang bukan berasal dari kode Srawung.
      ignoreErrors: ['ResizeObserver loop', 'Non-Error promise rejection', 'ChunkLoadError', /^Script error\.?$/],
      denyUrls: [/extensions\//i, /^chrome:\/\//i, /^chrome-extension:\/\//i, /^moz-extension:\/\//i],
    });
  });
} else {
  window.addEventListener('error', (event) => reportError(event.error ?? event.message));
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason));
}
