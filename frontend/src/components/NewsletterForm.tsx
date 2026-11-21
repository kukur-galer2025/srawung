'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

export function NewsletterForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState('loading');
    try {
      const res = await api.post('/newsletter/subscribe', { email: email.trim() });
      setMessage(res.message);
      setState('done');
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : 'Gagal mendaftar. Coba lagi.');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 ring-1 ring-emerald-400/20">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        {message}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="min-w-0">
      <div className="flex flex-col gap-2.5 rounded-[1.4rem] sm:flex-row sm:rounded-full sm:border sm:border-white/10 sm:bg-white/[0.04] sm:p-1.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email Anda"
          aria-label="Email untuk newsletter"
          className="h-12 w-full min-w-0 rounded-full sm:flex-1 border border-white/10 bg-white/[0.06] px-5 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-jade-300/50 focus:ring-4 focus:ring-jade-300/10 sm:h-11 sm:border-transparent sm:bg-transparent sm:focus:ring-0"
        />
        <button
          type="submit"
          disabled={state === 'loading'}
          className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-linear-to-r from-jade-400 to-brand-orange px-6 text-sm font-semibold text-slate-950 shadow-[0_12px_30px_-12px_rgba(47,174,123,0.8)] transition hover:brightness-105 disabled:opacity-60 sm:h-11"
        >
          {state === 'loading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Langganan
        </button>
      </div>
      {state === 'error' && <p className="mt-2 text-xs text-rose-300">{message}</p>}
      <p className="mt-3 px-1 text-xs text-slate-500">
        Gratis, bisa berhenti kapan saja. Lihat{' '}
        <Link href="/kebijakan-privasi" className="underline-offset-2 hover:text-slate-300 hover:underline">
          kebijakan privasi
        </Link>
        .
      </p>
    </form>
  );
}
