'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Lock, Mail, Phone, ShieldCheck, User as UserIcon } from 'lucide-react';
import { useAuth, type User } from '@/contexts/AuthContext';
import GoogleLoginButton from '@/components/GoogleLoginButton';
import AuthShell from '@/components/auth/AuthShell';
import {
  AuthAlert,
  AuthDivider,
  AuthField,
  AuthHeading,
  AuthSubmit,
  PasswordStrength,
  resolveRedirect,
} from '@/components/auth/AuthUI';

const WA_PATTERN = /^(\+?62|0)8\d{7,12}$/;

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, register } = useAuth();
  const redirectTo = params.get('redirect');

  const [form, setForm] = useState({ name: '', email: '', whatsapp: '', password: '', password_confirmation: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const goNext = (u: User) => router.replace(resolveRedirect(redirectTo, u.role));

  useEffect(() => {
    if (user) goNext(user);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const touch = (key: string) => () => setTouched((t) => ({ ...t, [key]: true }));

  const waDigits = form.whatsapp.replace(/[^\d+]/g, '');
  const errors = {
    whatsapp: form.whatsapp && !WA_PATTERN.test(waDigits) ? 'Format nomor tidak valid. Contoh: 081234567890' : null,
    password: form.password && form.password.length < 8 ? 'Minimal 8 karakter' : null,
    password_confirmation:
      form.password_confirmation && form.password_confirmation !== form.password ? 'Konfirmasi kata sandi tidak cocok' : null,
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ whatsapp: true, password: true, password_confirmation: true });
    setError(null);

    if (errors.whatsapp || errors.password || errors.password_confirmation) {
      setError('Periksa kembali isian yang ditandai merah.');
      return;
    }
    if (!agreeTerms) {
      setError('Anda perlu menyetujui Syarat & Ketentuan untuk membuat akun.');
      return;
    }

    setLoading(true);
    try {
      goNext(await register({ ...form, name: form.name.trim(), email: form.email.trim(), whatsapp: waDigits }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Pendaftaran gagal. Periksa kembali data Anda.');
      setLoading(false);
    }
  };

  return (
    <>
      <AuthHeading title="Buat akun Srawung" subtitle="Mulai membaca e-book berkualitas dalam hitungan menit." />

      {error && <AuthAlert>{error}</AuthAlert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthField
          label="Nama lengkap"
          icon={UserIcon}
          name="name"
          autoComplete="name"
          required
          autoFocus
          value={form.name}
          onChange={set('name')}
          placeholder="Contoh: Budi Santoso"
        />

        <AuthField
          label="Email"
          icon={Mail}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={form.email}
          onChange={set('email')}
          placeholder="nama@email.com"
          hint="Struk pembayaran & notifikasi pesanan dikirim ke email ini."
        />

        <AuthField
          label="Nomor WhatsApp"
          icon={Phone}
          type="tel"
          name="whatsapp"
          autoComplete="tel"
          inputMode="tel"
          required
          value={form.whatsapp}
          onChange={set('whatsapp')}
          onBlur={touch('whatsapp')}
          placeholder="081234567890"
          error={touched.whatsapp ? errors.whatsapp : null}
          hint="Untuk konfirmasi pesanan oleh admin."
        />

        <div>
          <AuthField
            label="Kata sandi"
            icon={Lock}
            revealable
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set('password')}
            onBlur={touch('password')}
            placeholder="Minimal 8 karakter"
            error={touched.password ? errors.password : null}
          />
          <PasswordStrength password={form.password} />
        </div>

        <AuthField
          label="Ulangi kata sandi"
          icon={ShieldCheck}
          revealable
          name="password_confirmation"
          autoComplete="new-password"
          required
          value={form.password_confirmation}
          onChange={set('password_confirmation')}
          onBlur={touch('password_confirmation')}
          placeholder="Ketik ulang kata sandi"
          error={touched.password_confirmation || form.password_confirmation.length >= form.password.length ? errors.password_confirmation : null}
        />

        <label className="flex cursor-pointer items-start gap-3 pt-1">
          <input
            type="checkbox"
            checked={agreeTerms}
            onChange={(e) => setAgreeTerms(e.target.checked)}
            className="mt-0.5 h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-slate-300 accent-blue-700"
          />
          <span className="text-sm leading-relaxed text-slate-600">
            Saya menyetujui{' '}
            <Link href="/syarat-ketentuan" target="_blank" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Syarat & Ketentuan
            </Link>{' '}
            serta{' '}
            <Link href="/kebijakan-privasi" target="_blank" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
              Kebijakan Privasi
            </Link>{' '}
            Srawung.
          </span>
        </label>

        <div className="pt-2">
          <AuthSubmit loading={loading} loadingText="Membuat akun…">
            Buat akun
            <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" />
          </AuthSubmit>
        </div>
      </form>

      <AuthDivider>atau daftar lebih cepat dengan</AuthDivider>

      <GoogleLoginButton text="signup_with" onSuccess={goNext} />

      <p className="mt-8 text-center text-sm text-slate-500">
        Sudah punya akun?{' '}
        <Link
          href={`/masuk${redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''}`}
          className="font-semibold text-blue-700 transition hover:text-blue-900"
        >
          Masuk di sini
        </Link>
      </p>
    </>
  );
}

export default function RegisterPage() {
  return (
    <AuthShell variant="register">
      <Suspense fallback={null}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
