'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Loader2, Mail, XCircle } from 'lucide-react';
import { api } from '@/lib/api';

/**
 * Halaman aksi dari tautan email (konfirmasi/berhenti langganan).
 * Aksi baru dijalankan saat tombol ditekan — pemindai tautan di email kantor
 * tidak bisa tanpa sengaja mengonfirmasi atau membatalkan langganan.
 */
function Inner({
  endpoint,
  params,
  title,
  description,
  button,
  danger,
}: {
  endpoint: string;
  params: string[];
  title: string;
  description: string;
  button: string;
  danger?: boolean;
}) {
  const search = useSearchParams();
  const values = Object.fromEntries(params.map((p) => [p, search.get(p) ?? '']));
  const valid = params.every((p) => values[p]);
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const run = async () => {
    setState('loading');
    try {
      const res = await api.post(endpoint, values);
      setMessage(res.message);
      setState('done');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Terjadi kesalahan.');
      setState('error');
    }
  };

  return (
    <div className="mx-auto my-16 max-w-md px-4 sm:my-24">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-[0_30px_60px_-40px_rgba(15,76,63,0.45)]">
        {state === 'done' ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        ) : state === 'error' || !valid ? (
          <XCircle className="mx-auto h-12 w-12 text-rose-500" />
        ) : (
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <Mail className="h-6 w-6" />
          </span>
        )}
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight text-slate-900">
          {state === 'done' ? 'Berhasil' : !valid ? 'Tautan tidak lengkap' : title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          {state === 'done' || state === 'error' ? message : !valid ? 'Buka tautan langsung dari email Anda.' : description}
        </p>
        {valid && state !== 'done' && (
          <button
            onClick={run}
            disabled={state === 'loading'}
            className={`mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-full font-semibold text-white transition disabled:opacity-60 ${
              danger ? 'bg-slate-900 hover:bg-slate-800' : 'bg-blue-700 hover:bg-blue-800'
            }`}
          >
            {state === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
            {button}
          </button>
        )}
        <Link href="/" className="mt-4 inline-block text-sm font-semibold text-blue-700 hover:underline">
          Kembali ke beranda
        </Link>
      </div>
    </div>
  );
}

export function EmailTokenAction(props: React.ComponentProps<typeof Inner>) {
  return (
    <Suspense fallback={<div className="mx-auto my-24 h-72 max-w-md animate-pulse rounded-3xl bg-slate-100" />}>
      <Inner {...props} />
    </Suspense>
  );
}
