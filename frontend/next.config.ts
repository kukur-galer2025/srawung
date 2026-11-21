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

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '8000' },
      { protocol: 'http', hostname: '127.0.0.1', port: '8000' },
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
