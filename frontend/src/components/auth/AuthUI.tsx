'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Info, Loader2, type LucideIcon } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Judul halaman                                                       */
/* ------------------------------------------------------------------ */
export function AuthHeading({ title, subtitle }: { title: string; subtitle?: ReactNode }) {
  return (
    <div className="mb-8">
      <h1 className="font-display text-[1.75rem] font-medium leading-tight tracking-tight text-slate-900 sm:text-[2rem]">
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-[15px] leading-relaxed text-slate-500">{subtitle}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Input dengan ikon, label, hint, dan error                          */
/* ------------------------------------------------------------------ */
interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  icon: LucideIcon;
  hint?: ReactNode;
  labelAside?: ReactNode;
  error?: string | null;
  /** Tampilkan tombol lihat/sembunyikan untuk input password. */
  revealable?: boolean;
}

export const AuthField = forwardRef<HTMLInputElement, FieldProps>(function AuthField(
  { label, icon: Icon, hint, labelAside, error, revealable, type = 'text', className = '', id, ...props },
  ref
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [revealed, setRevealed] = useState(false);
  const inputType = revealable ? (revealed ? 'text' : 'password') : type;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;

  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold text-slate-700">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="group relative">
        <Icon
          aria-hidden
          className={`pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 transition-colors ${
            error ? 'text-rose-400' : 'text-slate-400 group-focus-within:text-blue-600'
          }`}
        />
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`h-12 w-full rounded-xl border bg-slate-50/70 pl-11 text-[15px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-4 ${
            revealable ? 'pr-12' : 'pr-4'
          } ${
            error
              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/10'
              : 'border-slate-200 hover:border-slate-300 focus:border-blue-600 focus:ring-blue-600/10'
          }`}
          {...props}
        />
        {revealable && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            aria-label={revealed ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {revealed ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>
      {error ? (
        <p id={`${inputId}-error`} className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

/* ------------------------------------------------------------------ */
/* Tombol utama                                                       */
/* ------------------------------------------------------------------ */
export function AuthSubmit({
  loading,
  loadingText,
  children,
  disabled,
}: {
  loading?: boolean;
  loadingText?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(29,78,216,0.8)] transition hover:bg-blue-800 hover:shadow-[0_14px_28px_-10px_rgba(29,78,216,0.9)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-600/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {loading ? (
        <>
          <Loader2 className="h-[18px] w-[18px] animate-spin" />
          {loadingText ?? 'Memproses…'}
        </>
      ) : (
        children
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Pemisah "atau"                                                     */
/* ------------------------------------------------------------------ */
export function AuthDivider({ children = 'atau' }: { children?: ReactNode }) {
  return (
    <div className="my-6 flex items-center gap-4" role="separator">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-medium text-slate-400">{children}</span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Notifikasi                                                         */
/* ------------------------------------------------------------------ */
const ALERT_STYLE = {
  error: { box: 'border-rose-200 bg-rose-50 text-rose-700', icon: AlertCircle },
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: CheckCircle2 },
  info: { box: 'border-blue-200 bg-blue-50 text-blue-800', icon: Info },
} as const;

export function AuthAlert({ tone = 'error', children }: { tone?: keyof typeof ALERT_STYLE; children: ReactNode }) {
  const { box, icon: Icon } = ALERT_STYLE[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`mb-6 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${box}`}>
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" />
      <div className="leading-relaxed">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Meter kekuatan kata sandi                                          */
/* ------------------------------------------------------------------ */
export function passwordScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  else if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score += 0.5;
  return Math.min(4, Math.max(pw.length >= 8 ? 1 : 0, Math.floor(score)));
}

const STRENGTH = [
  { label: 'Terlalu pendek', color: 'bg-rose-500', text: 'text-rose-600' },
  { label: 'Lemah', color: 'bg-orange-500', text: 'text-orange-600' },
  { label: 'Cukup', color: 'bg-jade-500', text: 'text-jade-600' },
  { label: 'Kuat', color: 'bg-emerald-500', text: 'text-emerald-600' },
  { label: 'Sangat kuat', color: 'bg-emerald-600', text: 'text-emerald-700' },
];

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return null;
  const score = passwordScore(password);
  const s = STRENGTH[score];
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${i <= score ? s.color : 'bg-slate-200'}`} />
        ))}
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        Kekuatan: <span className={`font-semibold ${s.text}`}>{s.label}</span>
        {score < 3 && <span className="text-slate-400"> · gunakan 12+ karakter, huruf besar, angka & simbol</span>}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Redirect aman setelah login                                        */
/* ------------------------------------------------------------------ */
export function resolveRedirect(target: string | null, role: 'buyer' | 'creator' | 'admin'): string {
  const safe = target && target.startsWith('/') && !target.startsWith('//') ? target : null;
  if (role === 'admin') return safe?.startsWith('/admin') ? safe : '/admin';
  // Tujuan yang bukan wilayah role ini diabaikan (pembeli tidak diarahkan ke /admin atau /kreator).
  const forbidden = ['/admin', '/masuk', '/daftar', ...(role === 'creator' ? [] : ['/kreator'])];
  if (safe && !forbidden.some((p) => safe.startsWith(p))) return safe;
  return role === 'creator' ? '/kreator' : '/perpustakaan';
}
