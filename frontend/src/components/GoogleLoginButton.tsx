'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth, type User } from '@/contexts/AuthContext';

type GsiText = 'signin_with' | 'signup_with' | 'continue_with';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            itp_support?: boolean;
            use_fedcm_for_button?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: 'standard' | 'icon';
              theme?: 'outline' | 'filled_blue' | 'filled_black';
              size?: 'large' | 'medium' | 'small';
              text?: GsiText;
              shape?: 'rectangular' | 'pill' | 'circle' | 'square';
              logo_alignment?: 'left' | 'center';
              width?: number;
              locale?: string;
            }
          ) => void;
        };
      };
    };
  }
}

const SCRIPT_ID = 'google-gsi-script';
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

// GSI hanya boleh di-initialize sekali per halaman; callback diarahkan ke
// tombol yang sedang aktif lewat variabel modul ini.
let gsiInitialized = false;
let activeHandler: ((credential: string) => void) | null = null;

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve(), { once: true });
    script.addEventListener('error', () => reject(new Error('gsi-load-failed')), { once: true });
  });
}

interface GoogleLoginButtonProps {
  text?: GsiText;
  /** Dipanggil setelah login Google berhasil (halaman yang menentukan redirect). */
  onSuccess?: (user: User) => void;
}

export default function GoogleLoginButton({ text = 'continue_with', onSuccess }: GoogleLoginButtonProps) {
  const { loginWithGoogle } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>(CLIENT_ID ? 'loading' : 'failed');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Selalu pakai handler terbaru tanpa memicu render ulang tombol Google.
  const handlerRef = useRef<(credential: string) => void>(() => {});
  useEffect(() => {
    handlerRef.current = async (credential: string) => {
      setSubmitting(true);
      setError(null);
      try {
        const user = await loginWithGoogle(credential);
        onSuccess?.(user);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Gagal masuk dengan Google. Silakan coba lagi.');
        setSubmitting(false);
      }
    };
  });

  useEffect(() => {
    if (!CLIENT_ID) return;

    let cancelled = false;
    let lastWidth = 0;
    const handler = (credential: string) => handlerRef.current(credential);
    activeHandler = handler;

    const render = () => {
      const container = containerRef.current;
      const target = buttonRef.current;
      if (!container || !target || !window.google?.accounts?.id) return;

      // GSI hanya menerima lebar dalam piksel (200–400), bukan "100%".
      const width = Math.round(Math.min(400, Math.max(200, container.clientWidth)));
      if (width === lastWidth) return;
      lastWidth = width;

      target.innerHTML = '';
      window.google.accounts.id.renderButton(target, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text,
        shape: 'rectangular',
        logo_alignment: 'center',
        width,
        locale: 'id',
      });
    };

    let observer: ResizeObserver | null = null;

    loadGsiScript()
      .then(() => {
        if (cancelled || !window.google?.accounts?.id) return;
        if (!gsiInitialized) {
          window.google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: (response) => {
              if (response?.credential) activeHandler?.(response.credential);
            },
            cancel_on_tap_outside: true,
            itp_support: true,
            use_fedcm_for_button: true,
          });
          gsiInitialized = true;
        }
        render();
        setStatus('ready');

        if (containerRef.current && 'ResizeObserver' in window) {
          observer = new ResizeObserver(() => render());
          observer.observe(containerRef.current);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (activeHandler === handler) activeHandler = null;
    };
  }, [text]);

  // Fallback alur OAuth redirect (bila skrip Google diblokir ekstensi/jaringan).
  const redirectToGoogle = () => {
    window.location.href = `${API_URL}/auth/google/redirect`;
  };

  return (
    <div className="w-full">
      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">
          {error}
        </p>
      )}

      <div ref={containerRef} className="relative w-full">
        {/* Target render tombol resmi Google */}
        <div
          ref={buttonRef}
          className={`flex min-h-11 w-full justify-center transition-opacity ${
            status === 'ready' && !submitting ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        />

        {status === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center rounded-md border border-slate-200 bg-white">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-100" />
          </div>
        )}

        {submitting && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white text-sm font-medium text-slate-600">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            Menghubungkan ke Google…
          </div>
        )}

        {status === 'failed' && (
          <button
            type="button"
            onClick={redirectToGoogle}
            className="absolute inset-0 flex items-center justify-center gap-3 rounded-md border border-slate-300 bg-white text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <GoogleIcon />
            Lanjutkan dengan Google
          </button>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
    </svg>
  );
}
