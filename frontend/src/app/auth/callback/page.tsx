'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

function CallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const token = params.get('token');
    const error = params.get('error');

    if (error || !token) {
      router.replace(error ? `/masuk?error=${encodeURIComponent(error)}` : '/masuk');
      return;
    }

    localStorage.setItem('amania_token', token);
    // Bersihkan token dari URL/riwayat peramban.
    window.history.replaceState(null, '', '/auth/callback');

    api
      .get('/auth/me')
      .then(async (res) => {
        await refresh();
        router.replace(res.user?.role === 'admin' ? '/admin' : '/perpustakaan');
      })
      .catch(() => {
        localStorage.removeItem('amania_token');
        router.replace('/masuk?error=google_failed');
      });
  }, [params, router, refresh]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 p-4 text-center">
      <Loader2 className="h-8 w-8 animate-spin text-blue-700" />
      <p className="font-semibold text-slate-900">Menyelesaikan login Google…</p>
      <p className="text-sm text-slate-500">Mohon tunggu sebentar.</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={null}>
      <CallbackContent />
    </Suspense>
  );
}
