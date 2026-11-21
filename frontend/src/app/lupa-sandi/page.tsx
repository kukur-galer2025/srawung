'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Mail, MailCheck } from 'lucide-react';
import { api } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import { AuthAlert, AuthField, AuthHeading, AuthSubmit } from '@/components/auth/AuthUI';

const RESEND_COOLDOWN = 60;

function ForgotForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const send = async () => {
    setError(null);
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
      setCooldown(RESEND_COOLDOWN);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal mengirim tautan reset. Coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    send();
  };

  if (sent) {
    return (
      <div>
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
          <MailCheck className="h-7 w-7 text-emerald-600" />
        </div>
        <AuthHeading
          title="Cek email Anda"
          subtitle={
            <>
              Jika <span className="font-semibold text-slate-800">{email}</span> terdaftar, kami telah mengirim tautan untuk
              membuat kata sandi baru. Tautan berlaku 60 menit.
            </>
          }
        />

        {error && <AuthAlert>{error}</AuthAlert>}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          <p className="mb-2 font-semibold text-slate-800">Belum menerima email?</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Periksa folder <strong>Spam</strong> atau tab <strong>Promosi</strong>.</li>
            <li>Pastikan alamat email yang dimasukkan sudah benar.</li>
            <li>Tunggu 1–2 menit, lalu kirim ulang bila perlu.</li>
          </ul>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={send}
            disabled={cooldown > 0 || loading}
            className="h-11 flex-1 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {loading ? 'Mengirim…' : cooldown > 0 ? `Kirim ulang (${cooldown}s)` : 'Kirim ulang tautan'}
          </button>
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setError(null);
            }}
            className="h-11 flex-1 rounded-xl px-4 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
          >
            Gunakan email lain
          </button>
        </div>

        <BackToLogin />
      </div>
    );
  }

  return (
    <>
      <AuthHeading
        title="Lupa kata sandi?"
        subtitle="Masukkan email akun Anda. Kami akan mengirim tautan aman untuk membuat kata sandi baru."
      />

      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthField
          label="Email terdaftar"
          icon={Mail}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nama@email.com"
        />
        <AuthSubmit loading={loading} loadingText="Mengirim tautan…">
          Kirim tautan reset
          <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" />
        </AuthSubmit>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Mendaftar dengan Google? Anda tetap bisa memakai fitur ini untuk menambahkan kata sandi ke akun Anda.
      </p>

      <BackToLogin />
    </>
  );
}

function BackToLogin() {
  return (
    <Link
      href="/masuk"
      className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-slate-900"
    >
      <ArrowLeft className="h-4 w-4" />
      Kembali ke halaman masuk
    </Link>
  );
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell variant="recover">
      <Suspense fallback={null}>
        <ForgotForm />
      </Suspense>
    </AuthShell>
  );
}
