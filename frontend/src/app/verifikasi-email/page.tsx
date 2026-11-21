'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Loader2, MailCheck, MailX } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import AuthShell from '@/components/auth/AuthShell';
import { AuthHeading } from '@/components/auth/AuthUI';

type State = { status: 'loading' } | { status: 'success'; message: string } | { status: 'error'; message: string };

function VerifyContent() {
  const params = useSearchParams();
  const { user, refresh } = useAuth();
  const id = params.get('id');
  const hash = params.get('hash');
  const expires = params.get('expires');
  const signature = params.get('signature');
  const complete = !!(id && hash && expires && signature);

  const [fetched, setState] = useState<State>({ status: 'loading' });
  const state: State = complete
    ? fetched
    : { status: 'error', message: 'Tautan verifikasi tidak lengkap. Buka tautan langsung dari email Anda.' };
  const started = useRef(false);

  useEffect(() => {
    if (!complete || started.current) return; // cegah double-call di React StrictMode
    started.current = true;

    const qs = new URLSearchParams({ expires, signature }).toString();
    api
      .post(`/auth/email/verify/${encodeURIComponent(id!)}/${encodeURIComponent(hash!)}?${qs}`, {})
      .then((res) => {
        setState({ status: 'success', message: res.message ?? 'Email berhasil diverifikasi.' });
        refresh();
      })
      .catch((err: unknown) =>
        setState({ status: 'error', message: err instanceof Error ? err.message : 'Verifikasi gagal.' })
      );
  }, [complete, id, hash, expires, signature, refresh]);

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <Loader2 className="mb-4 h-10 w-10 animate-spin text-blue-700" />
        <p className="text-sm text-slate-500">Memverifikasi email Anda…</p>
      </div>
    );
  }

  const ok = state.status === 'success';
  return (
    <div>
      <div
        className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl ring-1 ${
          ok ? 'bg-emerald-50 ring-emerald-100' : 'bg-rose-50 ring-rose-100'
        }`}
      >
        {ok ? <MailCheck className="h-7 w-7 text-emerald-600" /> : <MailX className="h-7 w-7 text-rose-600" />}
      </div>
      <AuthHeading title={ok ? 'Email terverifikasi' : 'Verifikasi gagal'} subtitle={state.message} />
      <Link
        href={ok ? (user ? '/perpustakaan' : '/masuk') : user ? '/profil' : '/masuk'}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-[15px] font-semibold text-white transition hover:bg-blue-800"
      >
        {ok ? (user ? 'Buka perpustakaan' : 'Masuk ke akun') : user ? 'Kembali ke profil' : 'Ke halaman masuk'}
        <ArrowRight className="h-[18px] w-[18px]" />
      </Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell variant="register">
      <Suspense fallback={null}>
        <VerifyContent />
      </Suspense>
    </AuthShell>
  );
}
