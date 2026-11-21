'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BadgeCheck, KeyRound, Loader2, Lock, Mail, MailWarning, Phone, ShieldCheck, Sparkles, Trash2, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { confirmDialog, promptDialog, toast } from '@/lib/dialog';
import { TopicPicker } from '@/components/store/TopicPicker';
import { EmailPreferencesCard } from '@/components/profile/EmailPreferencesCard';
import { AuthAlert, AuthField, PasswordStrength } from '@/components/auth/AuthUI';
import { Avatar } from '@/components/Navbar';
import { Card, PageHeader } from '@/components/PageHeader';
import { showFlash } from '@/lib/flash';

type Msg = { tone: 'success' | 'error'; text: string } | null;

function SaveButton({ loading, children }: { loading: boolean; children: React.ReactNode }) {
  return (
    <button
      type="submit"
      disabled={loading}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-60"
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { user, refresh, logout } = useAuth();

  const [name, setName] = useState(user?.name ?? '');
  const [whatsapp, setWhatsapp] = useState(user?.whatsapp ?? '');
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<Msg>(null);

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');

  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailMsg, setEmailMsg] = useState<Msg>(null);
  const [deleting, setDeleting] = useState(false);

  if (!user) return null;
  const googleLinked = !!user.google_id;
  const googleOnly = googleLinked && user.has_password === false;

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMsg(null);
    try {
      await api.put('/profile', { name: name.trim(), whatsapp: whatsapp.replace(/[^\d+]/g, '') });
      await refresh();
      setProfileMsg({ tone: 'success', text: 'Profil berhasil diperbarui.' });
      showFlash({ tone: 'success', title: 'Profil disimpan', description: 'Nama dan nomor WhatsApp Anda sudah diperbarui.' });
    } catch (err: unknown) {
      setProfileMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal memperbarui profil.' });
    } finally {
      setProfileLoading(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg(null);
    if (next.length < 8) return setPwMsg({ tone: 'error', text: 'Kata sandi baru minimal 8 karakter.' });
    if (next !== confirm) return setPwMsg({ tone: 'error', text: 'Konfirmasi kata sandi tidak cocok.' });
    if (!user.whatsapp) return setPwMsg({ tone: 'error', text: 'Lengkapi nomor WhatsApp di data akun terlebih dahulu.' });

    setPwLoading(true);
    try {
      await api.put('/profile', {
        name: user.name,
        whatsapp: user.whatsapp,
        current_password: current,
        password: next,
        password_confirmation: confirm,
      });
      setCurrent('');
      setNext('');
      setConfirm('');
      setPwMsg({ tone: 'success', text: 'Kata sandi berhasil diubah.' });
      showFlash({ tone: 'success', title: 'Kata sandi diubah', description: 'Gunakan kata sandi baru saat masuk berikutnya.' });
    } catch (err: unknown) {
      setPwMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal mengubah kata sandi.' });
    } finally {
      setPwLoading(false);
    }
  };

  const changeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailMsg(null);
    if (!user.whatsapp) return setEmailMsg({ tone: 'error', text: 'Lengkapi nomor WhatsApp di data akun terlebih dahulu.' });
    setEmailLoading(true);
    try {
      const res = await api.put('/profile', { name: user.name, whatsapp: user.whatsapp, email: newEmail.trim(), current_password: emailPassword });
      await refresh();
      setNewEmail('');
      setEmailPassword('');
      setEmailMsg({ tone: 'success', text: res.message ?? 'Email diperbarui.' });
      showFlash({ tone: 'success', title: 'Email diperbarui', description: res.message ?? undefined });
    } catch (err: unknown) {
      setEmailMsg({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal mengganti email.' });
    } finally {
      setEmailLoading(false);
    }
  };

  const deleteAccount = async () => {
    const ok = await confirmDialog({
      title: 'Hapus akun Srawung?',
      text: 'Akses ke semua buku di perpustakaan, wishlist, ulasan, catatan, dan penanda halaman akan dihapus permanen. Catatan transaksi tetap kami simpan tanpa identitas untuk keperluan pembukuan. Tindakan ini tidak dapat dibatalkan.',
      confirmText: 'Lanjutkan',
      tone: 'danger',
    });
    if (!ok) return;

    const value = await promptDialog(
      googleLinked
        ? {
            title: 'Konfirmasi penghapusan',
            text: 'Ketik HAPUS (huruf besar) untuk menghapus akun secara permanen.',
            placeholder: 'HAPUS',
            confirmText: 'Hapus akun',
            validate: (v) => (v === 'HAPUS' ? null : 'Ketik HAPUS untuk mengonfirmasi.'),
          }
        : {
            title: 'Konfirmasi dengan kata sandi',
            text: 'Masukkan kata sandi akun Anda untuk menghapus akun secara permanen.',
            inputType: 'password',
            placeholder: 'Kata sandi',
            confirmText: 'Hapus akun',
            validate: (v) => (v ? null : 'Kata sandi wajib diisi.'),
          }
    );
    if (value === null || value === '') return;

    setDeleting(true);
    try {
      await api.delete('/profile', { body: JSON.stringify(googleLinked ? { confirmation: value } : { password: value }) });
      try {
        await logout();
      } catch {
        /* token sudah dicabut di server */
      }
      toast.success('Akun Anda telah dihapus. Terima kasih telah membaca bersama Srawung.');
      router.replace('/');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus akun.');
      setDeleting(false);
    }
  };

  const resend = async () => {
    setResendState('sending');
    try {
      await api.post('/auth/email/resend', {});
      setResendState('sent');
      showFlash({ tone: 'success', title: 'Tautan verifikasi dikirim', description: 'Cek kotak masuk dan folder spam email Anda.' });
    } catch {
      setResendState('idle');
      showFlash({ tone: 'error', title: 'Gagal mengirim tautan verifikasi', description: 'Coba lagi beberapa saat lagi.' });
    }
  };

  return (
    <>
      <PageHeader title="Profil" description="Kelola data akun dan keamanan Anda." />

      {/* Ringkasan akun */}
      <Card className="mb-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
        <Avatar name={user.name} src={user.avatar} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-semibold text-slate-900">{user.name}</p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {user.email_verified_at ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                <BadgeCheck className="h-3.5 w-3.5" />
                Email terverifikasi
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                <MailWarning className="h-3.5 w-3.5" />
                Email belum diverifikasi
              </span>
            )}
            {googleLinked && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-inset ring-slate-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                Terhubung dengan Google
              </span>
            )}
          </div>
        </div>
        {!user.email_verified_at && (
          <button
            onClick={resend}
            disabled={resendState !== 'idle'}
            className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:text-slate-400"
          >
            {resendState === 'sent' ? 'Tautan terkirim ✓' : resendState === 'sending' ? 'Mengirim…' : 'Kirim ulang verifikasi'}
          </button>
        )}
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-1 flex items-center gap-2 font-sans text-base font-semibold text-slate-900">
            <UserIcon className="h-[18px] w-[18px] text-blue-700" />
            Data akun
          </h2>
          <p className="mb-6 text-sm text-slate-500">Nama dan nomor WhatsApp untuk konfirmasi pesanan.</p>
          {profileMsg && <AuthAlert tone={profileMsg.tone}>{profileMsg.text}</AuthAlert>}
          <form onSubmit={saveProfile} className="space-y-4">
            <AuthField label="Email" icon={Mail} value={user.email} disabled readOnly hint="Ubah email di bagian “Email akun” di bawah." />
            <AuthField label="Nama lengkap" icon={UserIcon} required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            <AuthField
              label="Nomor WhatsApp"
              icon={Phone}
              type="tel"
              inputMode="tel"
              required
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="081234567890"
              autoComplete="tel"
            />
            <SaveButton loading={profileLoading}>Simpan perubahan</SaveButton>
          </form>
        </Card>

        <Card className="p-6">
          <h2 className="mb-1 flex items-center gap-2 font-sans text-base font-semibold text-slate-900">
            <KeyRound className="h-[18px] w-[18px] text-blue-700" />
            Kata sandi
          </h2>
          {googleOnly ? (
            <>
              <p className="mb-6 text-sm text-slate-500">
                Anda masuk dengan Google. Jika ingin juga bisa masuk memakai email & kata sandi, buat kata sandi lewat tautan yang dikirim ke email Anda.
              </p>
              <Link
                href={`/lupa-sandi?email=${encodeURIComponent(user.email)}`}
                className="inline-flex h-11 items-center rounded-xl border border-slate-200 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Buat / atur ulang kata sandi
              </Link>
            </>
          ) : (
            <>
              <p className="mb-6 text-sm text-slate-500">Gunakan kata sandi unik minimal 8 karakter.</p>
              {pwMsg && <AuthAlert tone={pwMsg.tone}>{pwMsg.text}</AuthAlert>}
              <form onSubmit={savePassword} className="space-y-4">
                <AuthField
                  label="Kata sandi saat ini"
                  icon={Lock}
                  revealable
                  required
                  value={current}
                  onChange={(e) => setCurrent(e.target.value)}
                  autoComplete="current-password"
                  labelAside={
                    <Link href={`/lupa-sandi?email=${encodeURIComponent(user.email)}`} className="text-xs font-semibold text-blue-700 hover:text-blue-900">
                      Lupa?
                    </Link>
                  }
                />
                <div>
                  <AuthField label="Kata sandi baru" icon={Lock} revealable required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
                  <PasswordStrength password={next} />
                </div>
                <AuthField
                  label="Ulangi kata sandi baru"
                  icon={ShieldCheck}
                  revealable
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  error={confirm && confirm.length >= next.length && confirm !== next ? 'Konfirmasi tidak cocok' : null}
                />
                <SaveButton loading={pwLoading}>Perbarui kata sandi</SaveButton>
              </form>
            </>
          )}
        </Card>
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-2">
        {/* Email akun */}
        <Card className="scroll-mt-24 p-6" id="email">
          <h2 className="mb-1 flex items-center gap-2 font-sans text-base font-semibold text-slate-900">
            <Mail className="h-[18px] w-[18px] text-blue-700" />
            Email akun
          </h2>
          {googleLinked ? (
            <p className="text-sm text-slate-500">Email akun yang terhubung dengan Google mengikuti akun Google Anda dan tidak dapat diubah di sini.</p>
          ) : (
            <>
              <p className="mb-6 text-sm text-slate-500">
                Invoice dan konfirmasi pembayaran dikirim ke email ini. Setelah diganti, kami mengirim tautan verifikasi ke email baru.
              </p>
              {emailMsg && <AuthAlert tone={emailMsg.tone}>{emailMsg.text}</AuthAlert>}
              <form onSubmit={changeEmail} className="space-y-4">
                <AuthField
                  label="Email baru"
                  icon={Mail}
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="nama@email.com"
                  autoComplete="email"
                />
                <AuthField
                  label="Kata sandi saat ini"
                  icon={Lock}
                  revealable
                  required
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <SaveButton loading={emailLoading}>Ganti email</SaveButton>
              </form>
            </>
          )}
        </Card>

        {/* Preferensi & data pribadi */}
        <Card className="p-6">
          <h2 className="mb-1 flex items-center gap-2 font-sans text-base font-semibold text-slate-900">
            <Sparkles className="h-[18px] w-[18px] text-amber-500" />
            Topik favorit
          </h2>
          <p className="mb-5 text-sm text-slate-500">Dipakai untuk menyusun rekomendasi buku di beranda.</p>
          <TopicPicker compact />
        </Card>
      </div>

      <div className="mt-6">
        <EmailPreferencesCard />
      </div>

      <Card className="mt-6 p-6">
        <h2 className="mb-1 flex items-center gap-2 font-sans text-base font-semibold text-slate-900">
          <ShieldCheck className="h-[18px] w-[18px] text-blue-700" />
          Data &amp; privasi
        </h2>
        <p className="mb-6 text-sm text-slate-500">
          Sesuai UU Pelindungan Data Pribadi, Anda berhak menghapus akun beserta data pribadi Anda kapan saja.{' '}
          <Link href="/kebijakan-privasi" className="font-semibold text-slate-700 underline-offset-2 hover:underline">
            Kebijakan privasi
          </Link>
        </p>
        {user.role !== 'admin' && (
          <div className="mt-5 flex flex-col gap-4 rounded-xl border border-rose-200 bg-rose-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-rose-800">Hapus akun</p>
              <p className="text-xs leading-relaxed text-rose-700/80">
                Menghapus akun secara permanen beserta akses semua buku Anda. Tidak dapat dibatalkan.
              </p>
            </div>
            <button
              onClick={deleteAccount}
              disabled={deleting}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Hapus akun
            </button>
          </div>
        )}
      </Card>
    </>
  );
}
