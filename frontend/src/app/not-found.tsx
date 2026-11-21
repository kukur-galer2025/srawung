import Link from 'next/link';
import { BookOpen, Home, Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 bg-blue-100 text-blue-800 rounded-3xl flex items-center justify-center mb-6 shadow-sm">
        <BookOpen className="w-10 h-10 stroke-[1.5]" />
      </div>

      <span className="text-jade-500 font-black text-6xl font-mono tracking-widest block mb-2">
        404
      </span>

      <h1 className="text-2xl sm:text-3xl font-medium font-display text-slate-900 mb-3">
        Halaman Tidak Ditemukan
      </h1>

      <p className="text-slate-500 max-w-md text-sm mb-8 leading-relaxed">
        Maaf, halaman buku atau tautan yang Anda tuju mungkin telah dipindahkan, dihapus, atau tidak pernah ada.
      </p>

      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Link
          href="/"
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-blue-800 hover:bg-blue-900 text-white font-bold text-xs shadow-md transition flex items-center justify-center space-x-2"
        >
          <Home className="w-4 h-4" />
          <span>Kembali ke Beranda</span>
        </Link>

        <Link
          href="/buku"
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-300 shadow-sm transition flex items-center justify-center space-x-2"
        >
          <Compass className="w-4 h-4" />
          <span>Jelajahi Katalog Buku</span>
        </Link>
      </div>
    </div>
  );
}
