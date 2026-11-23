'use client';

import { useState, type FormEvent } from 'react';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { AuthAlert, AuthField, AuthSubmit } from '@/components/auth/AuthUI';

/** Langkah kedua login: kode 6 angka dari aplikasi authenticator, atau kode pemulihan. */
export function TwoFactorPrompt({ onSubmit, onCancel }: { onSubmit: (code: string) => Promise<void>; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onSubmit(code.trim());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kode salah. Coba lagi.');
      setCode('');
      setLoading(false);
    }
  };

  return (
    <Modal isOpen onClose={onCancel} title="Verifikasi dua langkah" maxWidth="sm">
      <form onSubmit={submit} className="space-y-5">
        <p className="text-sm leading-relaxed text-slate-600">
          {recovery ? 'Masukkan salah satu kode pemulihan yang Anda simpan. Setiap kode hanya bisa dipakai sekali.' : 'Buka aplikasi authenticator di ponsel Anda, lalu masukkan kode 6 angka untuk Srawung.'}
        </p>
        {error && <AuthAlert>{error}</AuthAlert>}
        <AuthField
          key={recovery ? 'pemulihan' : 'kode'}
          label={recovery ? 'Kode pemulihan' : 'Kode authenticator'}
          icon={recovery ? KeyRound : ShieldCheck}
          value={code}
          onChange={(e) => setCode(recovery ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, '').slice(0, 6))}
          inputMode={recovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          placeholder={recovery ? 'ABCDE-12345' : '123456'}
          maxLength={recovery ? 11 : 6}
          required
          autoFocus
        />
        <AuthSubmit loading={loading} loadingText="Memeriksa…" disabled={recovery ? code.length < 11 : code.length !== 6}>
          Verifikasi
        </AuthSubmit>
        <button
          type="button"
          onClick={() => {
            setRecovery((v) => !v);
            setCode('');
            setError(null);
          }}
          className="w-full text-center text-sm font-semibold text-blue-700 transition hover:text-blue-900"
        >
          {recovery ? 'Pakai kode authenticator' : 'Ponsel tidak ada? Pakai kode pemulihan'}
        </button>
      </form>
    </Modal>
  );
}
