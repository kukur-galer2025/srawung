'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';
import { reportError } from '@/lib/monitoring';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled app error:', error);
    // Error yang ditangkap error boundary tidak sampai ke window.onerror → laporkan manual.
    reportError(error, { digest: error.digest });
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-medium font-display text-slate-900 mb-2">
        Terjadi Kesalahan Sistem
      </h1>

      <p className="text-slate-500 max-w-md text-sm mb-6 leading-relaxed">
        {error.message || 'Mohon maaf, halaman ini mengalami gangguan saat memproses permintaan Anda.'}
      </p>

      <div className="flex gap-3">
        <button
          onClick={() => reset()}
          className="px-5 py-2.5 rounded-xl bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs shadow-md transition flex items-center space-x-1.5"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Muat Ulang Halaman</span>
        </button>

        <Link
          href="/"
          className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-300 shadow-sm transition flex items-center space-x-1.5"
        >
          <Home className="w-4 h-4" />
          <span>Ke Beranda</span>
        </Link>
      </div>
    </div>
  );
}
