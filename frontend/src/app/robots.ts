import type { MetadataRoute } from 'next';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Area pribadi & transaksi tidak perlu (dan tidak boleh) diindeks.
      disallow: [
        '/admin',
        '/baca/',
        '/perpustakaan',
        '/pesanan',
        '/keranjang',
        '/profil',
        '/wishlist',
        '/newsletter/',
        '/email/',
        '/cari',
        '/masuk',
        '/daftar',
        '/lupa-sandi',
        '/reset-sandi',
        '/verifikasi-email',
        '/auth/',
        '/buku?*search=',
      ],
    },
    sitemap: `${SITE}/sitemap.xml`,
  };
}
