'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { resolveRedirect } from '@/components/auth/AuthUI';
import { useAuth } from '@/contexts/AuthContext';

function CallbackContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { exchangeGoogle } = useAuth();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    const code = params.get('code');
    const error = params.get('error');
    const verifier = sessionStorage.getItem('google_verifier');
    sessionStorage.removeItem('google_verifier');

    if (error || !code || !verifier) {
      router.replace(error ? `/masuk?error=${encodeURIComponent(error)}` : '/masuk?error=google_failed');
      return;
    }

    // Kode sekali pakai (60 detik); tetap dibersihkan dari URL/riwayat peramban.
    window.history.replaceState(null, '', '/auth/callback');

    exchangeGoogle(code, verifier)
      .then((user) => router.replace(resolveRedirect(null, user.role)))
      .catch(() => router.replace('/masuk?error=google_failed'));
  }, [params, router, exchangeGoogle]);

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
