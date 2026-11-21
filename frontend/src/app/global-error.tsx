'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/monitoring';

/**
 * Pengaman terakhir bila layout utama sendiri gagal dirender
 * (error.tsx tidak dapat menangkap error di root layout).
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest });
  }, [error]);

  return (
    <html lang="id">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', fontFamily: 'system-ui, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <main style={{ maxWidth: 420, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 24, margin: '0 0 8px' }}>Maaf, terjadi gangguan</h1>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, margin: '0 0 20px' }}>
            Tim kami sudah menerima laporan otomatis. Silakan muat ulang halaman.
          </p>
          <button
            onClick={() => reset()}
            style={{ background: '#1d4ed8', color: '#fff', border: 0, borderRadius: 12, padding: '10px 20px', fontWeight: 600, cursor: 'pointer' }}
          >
            Muat ulang
          </button>
        </main>
      </body>
    </html>
  );
}
