import type { Metadata, Viewport } from 'next';
import { Inter, Space_Grotesk } from 'next/font/google';
import 'sweetalert2/dist/sweetalert2.min.css';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { CartProvider } from '@/contexts/CartContext';
import { Analytics } from '@/components/Analytics';
import { CartSync } from '@/components/CartSync';
import { FlashHost } from '@/components/FlashHost';
import { AssistantWidget } from '@/components/AssistantWidget';
import { Suspense } from 'react';
import { preconnect } from 'react-dom';

const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api').origin;
  } catch {
    return null;
  }
})();

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
// Space Grotesk: judul (identitas SRAWUNG); Inter untuk teks & antarmuka.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk', weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: { default: 'Srawung — Sinau Bareng, Berkarya Bareng', template: '%s | Srawung' },
  description:
    'Srawung — ruang belajar dan berkarya bersama. Ebook & buku digital praktis untuk pemrograman, AI, desain UI/UX, dan persiapan ujian (CPNS, SNBT). Sinau Bareng, Berkarya Bareng.',
  keywords: ['buku digital', 'e-book', 'toko buku online', 'baca buku online', 'srawung', 'sinau bareng', 'belajar bareng'],
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  applicationName: 'Srawung',
  openGraph: {
    type: 'website',
    locale: 'id_ID',
    siteName: 'Srawung',
    images: [{ url: '/brand/og-image.png', width: 1200, height: 630, alt: 'Srawung — Sinau Bareng, Berkarya Bareng' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#0F4C3F',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Buka koneksi ke server sampul/API sejak awal → sampul pertama tidak menunggu DNS + TCP + TLS.
  if (API_ORIGIN) {
    preconnect(API_ORIGIN);
    preconnect(API_ORIGIN, { crossOrigin: 'anonymous' });
  }
  return (
    <html lang="id" data-scroll-behavior="smooth">
      <body
        className={`${inter.variable} ${spaceGrotesk.variable} font-sans bg-white text-slate-900 min-h-screen antialiased`}
      >
        <AuthProvider>
          <CartProvider>
            {children}
            <FlashHost />
            <AssistantWidget />
            <CartSync />
            <Suspense fallback={null}>
              <Analytics />
            </Suspense>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
