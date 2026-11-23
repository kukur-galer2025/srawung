import type { NextConfig } from 'next';

type RemotePattern = { protocol: 'http' | 'https'; hostname: string; port?: string };

// Domain backend saat online (mis. https://api.amania.id/api) otomatis diizinkan untuk
// gambar sampul & blog — cukup isi NEXT_PUBLIC_API_URL, tidak perlu mengedit file ini.
function apiImagePattern(): RemotePattern[] {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_API_URL || '');
    return [{ protocol: url.protocol.replace(':', '') as 'http' | 'https', hostname: url.hostname, ...(url.port ? { port: url.port } : {}) }];
  } catch {
    return [];
  }
}

const isProd = process.env.NODE_ENV === 'production';

const origin = (value?: string) => {
  try {
    return value ? new URL(value).origin : '';
  } catch {
    return '';
  }
};
const API = origin(process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:8000';
const SENTRY = origin(process.env.NEXT_PUBLIC_SENTRY_DSN);

/**
 * Content-Security-Policy: peramban menolak skrip dari situs lain, plugin, pembingkaian, dan pengiriman
 * data ke server yang tidak dikenal, walaupun suatu saat ada celah penyisipan kode.
 * 'unsafe-inline' masih diperlukan karena halaman toko dibuat statis (tanpa nonce per permintaan).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"} https://accounts.google.com https://www.googletagmanager.com https://connect.facebook.net`,
  "style-src 'self' 'unsafe-inline' https://accounts.google.com",
  `img-src 'self' data: blob: https: ${API}${isProd ? '' : ' http:'}`,
  "font-src 'self' data:",
  `connect-src 'self' blob: ${API} ${SENTRY} https://accounts.google.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com https://www.facebook.com${isProd ? '' : ' ws: http://localhost:*'}`,
  "frame-src 'self' blob: https://accounts.google.com",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  ...(isProd && API.startsWith('https:') ? ['upgrade-insecure-requests'] : []),
].join('; ').replace(/ {2,}/g, ' ');

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      // Hanya saat pengembangan: di produksi pengoptimal gambar tidak boleh mengambil dari dalam server.
      ...(isProd ? [] : ([{ protocol: 'http', hostname: 'localhost', port: '8000' }, { protocol: 'http', hostname: '127.0.0.1', port: '8000' }] as RemotePattern[])),
      ...apiImagePattern(),
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Diperlukan agar popup Login Google dapat berkomunikasi balik ke
          // halaman ini (menghilangkan peringatan "Cross-Origin-Opener-Policy
          // policy would block the window.postMessage call").
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Content-Security-Policy', value: csp },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Cegah situs lain membingkai toko (clickjacking).
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          // HSTS hanya di build produksi (yang berjalan di HTTPS), tidak di localhost.
          ...(isProd ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
