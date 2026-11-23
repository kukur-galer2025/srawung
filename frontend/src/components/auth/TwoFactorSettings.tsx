'use client';

import { useState, type FormEvent } from 'react';
import { Copy, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { confirmDialog, toast } from '@/lib/dialog';
import { Button, Field, Input, Notice, Panel, PanelHeader } from '@/components/admin/ui';

type Setup = { secret: string; qr: string };
const message = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** Pengaturan verifikasi dua langkah + keluarkan perangkat lain (admin & kreator). */
export function TwoFactorSettings() {
  const { user, refresh } = useAuth();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const active = !!user.two_factor_enabled;

  const run = async (fn: () => Promise<void>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e: unknown) {
      setError(message(e, fallback));
    } finally {
      setBusy(false);
    }
  };

  const start = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      setSetup(await api.post('/auth/two-factor/setup', { password }));
      setPassword('');
    }, 'Gagal menyiapkan verifikasi dua langkah.');
  };

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const res = await api.post('/auth/two-factor/confirm', { code });
      setRecovery(res.recovery_codes);
      setSetup(null);
      setCode('');
      await refresh();
    }, 'Kode salah.');
  };

  const disable = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const ok = await confirmDialog({ title: 'Matikan verifikasi dua langkah?', text: 'Akun Anda hanya akan dilindungi kata sandi atau Google.', confirmText: 'Matikan', tone: 'danger' });
      if (!ok) return;
      const res = await api.post('/auth/two-factor/disable', { code });
      setCode('');
      toast.success(res.message);
      await refresh();
    }, 'Kode salah.');
  };

  const logoutOthers = () =>
    run(async () => {
      const res = await api.post('/auth/logout-others', {});
      toast.success(res.message);
    }, 'Gagal mengeluarkan perangkat lain.');

  return (
    <div className="space-y-5">
      {error && (
        <Notice tone="error" onClose={() => setError(null)}>
          {error}
        </Notice>
      )}

      {recovery && (
        <Panel className="border-emerald-300">
          <PanelHeader title="Simpan kode pemulihan ini sekarang" description="Hanya ditampilkan sekali. Dipakai bila ponsel Anda hilang; setiap kode berlaku satu kali." />
          <div className="p-5">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-4 font-mono text-sm sm:grid-cols-4">
              {recovery.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => navigator.clipboard.writeText(recovery.join('\n')).then(() => toast.success('Kode disalin.'))}>
                <Copy className="h-4 w-4" />
                Salin
              </Button>
              <Button size="sm" onClick={() => setRecovery(null)}>
                Sudah saya simpan
              </Button>
            </div>
          </div>
        </Panel>
      )}

      <Panel>
        <PanelHeader
          title="Verifikasi dua langkah (2FA)"
          description="Setelah kata sandi atau Google, login meminta kode dari ponsel Anda. Pencuri kata sandi tetap tidak bisa masuk."
        />
        <div className="p-5">
          <p className={`mb-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${active ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {active ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
            {active ? 'Aktif' : 'Belum aktif'}
          </p>

          {active ? (
            <form onSubmit={disable} className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Field label="Kode authenticator untuk mematikan">
                  <Input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" maxLength={11} required />
                </Field>
              </div>
              <Button type="submit" variant="secondary" loading={busy}>
                Matikan
              </Button>
            </form>
          ) : setup ? (
            <form onSubmit={confirm} className="grid gap-6 sm:grid-cols-[auto_1fr]">
              {/* eslint-disable-next-line @next/next/no-img-element -- QR berupa data URI */}
              <img src={setup.qr} alt="QR untuk aplikasi authenticator" className="h-48 w-48 rounded-xl ring-1 ring-slate-200" />
              <div className="space-y-4">
                <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-600">
                  <li>Pasang Google Authenticator, Microsoft Authenticator, atau Authy di ponsel.</li>
                  <li>
                    Pindai QR ini, atau ketik kunci: <span className="break-all font-mono text-xs text-slate-900">{setup.secret}</span>
                  </li>
                  <li>Masukkan kode 6 angka yang muncul.</li>
                </ol>
                <Field label="Kode 6 angka">
                  <Input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" required autoFocus />
                </Field>
                <div className="flex gap-2">
                  <Button type="submit" loading={busy} disabled={code.length !== 6}>
                    Aktifkan
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                    Batal
                  </Button>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={start} className="flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
              {user.has_password !== false && (
                <div className="flex-1">
                  <Field label="Kata sandi Anda">
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                  </Field>
                </div>
              )}
              <Button type="submit" loading={busy}>
                <ShieldCheck className="h-4 w-4" />
                Aktifkan 2FA
              </Button>
            </form>
          )}
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Perangkat lain"
          description="Lupa keluar di komputer lain, atau curiga ada yang memakai akun Anda? Keluarkan semuanya, kecuali perangkat ini."
          actions={
            <Button size="sm" variant="secondary" onClick={logoutOthers} loading={busy}>
              <LogOut className="h-4 w-4" />
              Keluarkan semua
            </Button>
          }
        />
      </Panel>
    </div>
  );
}
