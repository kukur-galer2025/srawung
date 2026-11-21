'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Lock, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import AuthShell from '@/components/auth/AuthShell';
import { AuthAlert, AuthField, AuthHeading, AuthSubmit, PasswordStrength } from '@/components/auth/AuthUI';

function ResetForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';

  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token || !email) {
    return (
      <div>
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 ring-1 ring-jade-100">
          <ShieldAlert className="h-7 w-7 text-jade-600" />
        </div>
        <AuthHeading
          title="Tautan tidak lengkap"
          subtitle="Tautan reset kata sandi tidak valid. Pastikan Anda membuka tautan lengkap dari email, atau minta tautan baru."
        />
        <Link
          href="/lupa-sandi"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-[15px] font-semibold text-white transition hover:bg-blue-800"
        >
          Minta tautan baru
          <ArrowRight className="h-[18px] w-[18px]" />
        </Link>
      </div>
    );
  }

  const mismatch = confirmation.length > 0 && confirmation !== password;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) return setError('Kata sandi minimal 8 karakter.');
    if (password !== confirmation) return setError('Konfirmasi kata sandi tidak cocok.');

    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        email,
        password,
        password_confirmation: confirmation,
      });
      router.replace(`/masuk?reset=1&email=${encodeURIComponent(email)}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal memperbarui kata sandi.');
      setLoading(false);
    }
  };

  return (
    <>
      <AuthHeading
        title="Buat kata sandi baru"
        subtitle={
          <>
            Untuk akun <span className="font-semibold text-slate-800">{email}</span>. Setelah disimpan, semua perangkat lain
            akan otomatis keluar.
          </>
        }
      />

      {error && (
        <AuthAlert>
          {error}{' '}
          {/kedaluwarsa|tidak valid/i.test(error) && (
            <Link href="/lupa-sandi" className="font-semibold underline">
              Minta tautan baru
            </Link>
          )}
        </AuthAlert>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <AuthField
            label="Kata sandi baru"
            icon={Lock}
            revealable
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimal 8 karakter"
          />
          <PasswordStrength password={password} />
        </div>

        <AuthField
          label="Ulangi kata sandi baru"
          icon={ShieldCheck}
          revealable
          name="password_confirmation"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          placeholder="Ketik ulang kata sandi"
          error={mismatch && confirmation.length >= password.length ? 'Konfirmasi kata sandi tidak cocok' : null}
        />

        <AuthSubmit loading={loading} loadingText="Menyimpan…">
          Simpan kata sandi
          <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" />
        </AuthSubmit>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthShell variant="recover">
      <Suspense fallback={null}>
        <ResetForm />
      </Suspense>
    </AuthShell>
  );
}
