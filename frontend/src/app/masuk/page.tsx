'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { useAuth, type User } from '@/contexts/AuthContext';
import GoogleLoginButton from '@/components/GoogleLoginButton';
import AuthShell from '@/components/auth/AuthShell';
import { AuthAlert, AuthDivider, AuthField, AuthHeading, AuthSubmit, resolveRedirect } from '@/components/auth/AuthUI';

const QUERY_ERRORS: Record<string, string> = {
  google_failed: 'Login dengan Google gagal atau dibatalkan. Silakan coba lagi.',
  google_token_failed: 'Login dengan Google gagal. Silakan coba lagi.',
  no_id_token: 'Login dengan Google gagal. Silakan coba lagi.',
  invalid_token: 'Sesi Google tidak valid. Silakan coba lagi.',
  account_blocked: 'Akun Anda diblokir. Hubungi admin Srawung untuk bantuan.',
};

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, login } = useAuth();

  const redirectTo = params.get('redirect');
  const queryError = params.get('error');
  const justReset = params.get('reset') === '1';

  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(queryError ? QUERY_ERRORS[queryError] ?? 'Terjadi kesalahan saat masuk.' : null);

  const goNext = (u: User) => router.replace(resolveRedirect(redirectTo, u.role));

  // Sudah login → langsung arahkan.
  useEffect(() => {
    if (user) goNext(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      goNext(await login(email.trim(), password));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Email atau kata sandi salah.');
      setLoading(false);
    }
  };

  return (
    <>
      <AuthHeading title="Masuk ke Srawung" subtitle="Lanjutkan membaca koleksi buku digital Anda." />

      {justReset && !error && (
        <AuthAlert tone="success">Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru Anda.</AuthAlert>
      )}
      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-5">
        <AuthField
          label="Email"
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

        <AuthField
          label="Kata sandi"
          icon={Lock}
          revealable
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Masukkan kata sandi"
          labelAside={
            <Link href={`/lupa-sandi${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="text-sm font-semibold text-blue-700 transition hover:text-blue-900">
              Lupa sandi?
            </Link>
          }
        />

        <AuthSubmit loading={loading} loadingText="Memverifikasi…">
          Masuk
          <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" />
        </AuthSubmit>
      </form>

      <AuthDivider>atau lanjutkan dengan</AuthDivider>

      <GoogleLoginButton text="signin_with" onSuccess={goNext} />

      <p className="mt-8 text-center text-sm text-slate-500">
        Belum punya akun?{' '}
        <Link
          href={`/daftar${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}
          className="font-semibold text-blue-700 transition hover:text-blue-900"
        >
          Daftar gratis
        </Link>
      </p>
    </>
  );
}

export default function LoginPage() {
  return (
    <AuthShell variant="login">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
