'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Activity, CheckCircle2, ImagePlus, MessageCircle, QrCode, Timer, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { AdminHeader, Button, Field, Input, Notice, Panel, Textarea } from '@/components/admin/ui';

type Settings = {
  qris_merchant_name: string;
  qris_nmid: string;
  whatsapp_admin: string;
  payment_deadline_hours: string;
  payment_message_template: string;
  admin_notification_email: string;
  creator_commission_percent: string;
  creator_min_payout: string;
  creator_payout_fee: string;
};

const DEFAULTS: Settings = {
  qris_merchant_name: 'AMANIA - SOFTWARE',
  qris_nmid: '',
  whatsapp_admin: '',
  payment_deadline_hours: '24',
  payment_message_template: 'Halo {nama}, pesanan #{nomor} senilai Rp {total} telah {status}. Terima kasih!',
  admin_notification_email: '',
  creator_commission_percent: '20',
  creator_min_payout: '100000',
  creator_payout_fee: '5000',
};

interface SystemStatus {
  pdf_converter: { ok: boolean; engine: string | null };
  queue: { ok: boolean; pending: number; oldest_waiting_seconds: number; failed: number };
  scheduler: { ok: boolean; last_run: string | null };
  disk?: { ok: boolean; free_percent: number | null };
  production?: { debug: boolean; env: string };
  books_failed: number;
}

const fmtDateTime = (iso: string) => new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

function StatusRow({ ok, title, detail, fix }: { ok: boolean; title: string; detail: string; fix?: string }) {
  return (
    <li className="flex items-start gap-3 py-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" /> : <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />}
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="text-slate-500">{detail}</p>
        {!ok && fix && <p className="mt-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-rose-800">{fix}</p>}
      </div>
    </li>
  );
}

function SystemStatusPanel() {
  const { data } = useSWR<SystemStatus>('/admin/system-status', (url: string) => api.get(url), { refreshInterval: 30_000 });
  if (!data) return <div className="mb-6 h-40 animate-pulse rounded-2xl bg-slate-200/70" />;

  const lastRun = data.scheduler.last_run ? fmtDateTime(data.scheduler.last_run) : null;

  const queueDetail = data.queue.ok
    ? `Berjalan normal · ${data.queue.pending} tugas di antrean${data.queue.failed ? ` · ${data.queue.failed} tugas pernah gagal` : ''}`
    : `${data.queue.pending} tugas tertahan, yang terlama sudah ${Math.round(data.queue.oldest_waiting_seconds / 60)} menit`;

  return (
    <Panel className="mb-6 p-6">
      <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
        <Activity className="h-[18px] w-[18px] text-blue-700" />
        Status sistem
      </h2>
      <p className="mb-2 text-sm text-slate-500">Proses latar belakang yang harus berjalan agar toko berfungsi penuh.</p>
      <ul className="divide-y divide-slate-100">
        <StatusRow
          ok={data.queue.ok}
          title="Queue worker (email & konversi PDF)"
          detail={queueDetail}
          fix='Email dan konversi PDF tidak diproses. Jalankan ulang run-dev.bat dan biarkan jendela "Queue Worker" terbuka.'
        />
        <StatusRow
          ok={data.scheduler.ok}
          title="Scheduler (kedaluwarsa pesanan otomatis)"
          detail={lastRun ? `Terakhir berjalan ${lastRun}` : 'Belum pernah berjalan'}
          fix='Jalankan ulang run-dev.bat dan biarkan jendela "Scheduler" terbuka. Status pesanan tetap dikoreksi saat halaman pesanan dibuka.'
        />
        <StatusRow
          ok={data.pdf_converter.ok}
          title="Konverter PDF"
          detail={data.pdf_converter.ok ? `Terpasang (${data.pdf_converter.engine === 'poppler' ? 'Poppler' : 'Ghostscript'})` : 'Tidak ditemukan'}
          fix="PDF buku tidak bisa diubah jadi halaman. Pasang Poppler (winget install oschwartz10612.Poppler) atau isi PDF_CONVERTER_PATH di backend/.env."
        />
        {data.disk && data.disk.free_percent !== null && !data.disk.ok && (
          <StatusRow ok={false} title="Ruang disk hampir penuh" detail={`Tersisa ${data.disk.free_percent}%`} fix="Hapus file yang tidak perlu atau pindahkan gambar halaman buku ke object storage." />
        )}
        {data.production?.env === 'production' && data.production.debug && (
          <StatusRow ok={false} title="Mode debug aktif di server" detail="APP_DEBUG=true" fix="Detail error & konfigurasi dapat terlihat publik. Ubah APP_DEBUG=false di backend/.env lalu jalankan php artisan optimize." />
        )}
        {data.books_failed > 0 && (
          <StatusRow ok={false} title="Konversi PDF gagal" detail={`${data.books_failed} buku gagal dikonversi`} fix='Buka menu Buku dan klik "Coba lagi" pada buku yang gagal.' />
        )}
      </ul>
    </Panel>
  );
}

function QrisImagePanel({ url, onChanged }: { url: string | null; onChanged: () => void }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setMessage(null);
    const fd = new FormData();
    fd.append('qris', file);
    try {
      await api.post('/admin/settings/qris', fd);
      setMessage({ tone: 'success', text: 'Gambar QRIS diperbarui. Pembeli langsung melihat QRIS baru.' });
      onChanged();
    } catch (err: unknown) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal mengunggah QRIS.' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
      <div className="w-full max-w-[180px] shrink-0 overflow-hidden rounded-xl bg-white p-1.5 ring-1 ring-slate-200">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element -- pratinjau gambar dari server
          <img src={url} alt="QRIS saat ini" className="h-auto w-full rounded-lg" />
        ) : (
          <div className="flex aspect-[3/4] items-center justify-center p-4 text-center text-xs text-slate-500">Belum ada gambar QRIS</div>
        )}
      </div>
      <div className="space-y-3 text-sm text-slate-600">
        <p>Gambar ini tampil di halaman pembayaran dan invoice PDF. Unggah ulang bila QRIS dari penyedia Anda berganti.</p>
        <label className={`inline-flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 font-semibold text-slate-700 transition hover:bg-slate-50 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
          <ImagePlus className="h-4 w-4" />
          {uploading ? 'Mengunggah…' : 'Ganti gambar QRIS'}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        <p className="text-xs text-slate-500">JPG, PNG, atau WebP · maks. 3 MB · pastikan kode QR terlihat tajam.</p>
        {message && <p className={`text-sm font-medium ${message.tone === 'success' ? 'text-emerald-700' : 'text-rose-600'}`}>{message.text}</p>}
      </div>
    </div>
  );
}

function SettingsForm({ initial, qrisUrl, onSaved }: { initial: Settings; qrisUrl: string | null; onSaved: () => void }) {
  const [form, setForm] = useState<Settings>(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const set = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await api.put('/admin/settings', {
        settings: {
          ...form,
          qris_nmid: form.qris_nmid.replace(/\s/g, ''),
          whatsapp_admin: form.whatsapp_admin.replace(/\D/g, '').replace(/^0/, '62'),
        },
      });
      setNotice({ tone: 'success', text: 'Pengaturan disimpan.' });
      onSaved();
    } catch (err: unknown) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal menyimpan pengaturan.' });
    } finally {
      setSaving(false);
    }
  };

  const preview = form.payment_message_template
    .replace('{nama}', 'Budi')
    .replace('{nomor}', 'AMN-ABCD-20261116')
    .replace('{total}', '149.437')
    .replace('{status}', 'DIKONFIRMASI');

  return (
    <form onSubmit={submit} className="space-y-6">
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <Panel className="p-6">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
          <QrCode className="h-[18px] w-[18px] text-blue-700" />
          Pembayaran QRIS
        </h2>
        <p className="mb-5 text-sm text-slate-500">Satu-satunya metode pembayaran. Pembeli memindai QRIS, membayar sesuai total pesanan, lalu mengunggah bukti bayar.</p>
        <QrisImagePanel url={qrisUrl} onChanged={onSaved} />
        <div className="mt-6 grid gap-4 border-t border-slate-100 pt-5 sm:grid-cols-2">
          <Field label="Nama merchant" hint="Sesuai nama yang muncul di aplikasi pembeli saat memindai">
            <Input required maxLength={100} value={form.qris_merchant_name} onChange={set('qris_merchant_name')} />
          </Field>
          <Field label="NMID" hint="National Merchant ID, tertera di bawah nama merchant">
            <Input maxLength={40} value={form.qris_nmid} onChange={set('qris_nmid')} placeholder="ID1026514804818" className="font-mono" />
          </Field>
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="mb-5 flex items-center gap-2 text-base font-semibold text-slate-900">
          <Timer className="h-[18px] w-[18px] text-blue-700" />
          Pesanan
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Batas waktu pembayaran (jam)" hint="Pesanan otomatis kedaluwarsa setelah ini">
            <Input required type="number" min={1} max={168} value={form.payment_deadline_hours} onChange={set('payment_deadline_hours')} />
          </Field>
          <Field label="WhatsApp admin" hint="Format 628xxxxxxxxxx">
            <Input required inputMode="tel" value={form.whatsapp_admin} onChange={set('whatsapp_admin')} placeholder="6285724026505" />
          </Field>
          <Field label="Email notifikasi admin" hint="Menerima email setiap ada bukti pembayaran baru. Kosongkan = kotak masuk toko (pengirim email).">
            <Input type="email" value={form.admin_notification_email} onChange={set('admin_notification_email')} placeholder="kasir@tokoanda.com" />
          </Field>
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Kreator</h2>
        <p className="mb-5 text-sm text-slate-500">Bagian Srawung dari setiap buku kreator yang terjual. Komisi khusus per kreator bisa diatur di menu Kreator.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Komisi Srawung (%)" hint={`Kreator menerima ${100 - (Number(form.creator_commission_percent) || 0)}% dari harga yang dibayar pembeli.`}>
            <Input type="number" min={0} max={90} value={form.creator_commission_percent} onChange={set('creator_commission_percent')} />
          </Field>
          <Field label="Minimal penarikan (Rp)">
            <Input type="number" min={10000} step={5000} value={form.creator_min_payout} onChange={set('creator_min_payout')} />
          </Field>
          <Field label="Biaya admin per penarikan (Rp)" hint="Dipotong dari jumlah yang ditarik kreator. Tercantum di S&K Kreator.">
            <Input type="number" min={0} step={500} value={form.creator_payout_fee} onChange={set('creator_payout_fee')} />
          </Field>
        </div>
      </Panel>

      <Panel className="p-6">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
          <MessageCircle className="h-[18px] w-[18px] text-emerald-600" />
          Template pesan WhatsApp
        </h2>
        <p className="mb-5 text-sm text-slate-500">
          Dipakai untuk tombol &quot;Kirim via WhatsApp&quot; saat verifikasi. Variabel: <code className="rounded bg-slate-100 px-1">{'{nama}'}</code>{' '}
          <code className="rounded bg-slate-100 px-1">{'{nomor}'}</code> <code className="rounded bg-slate-100 px-1">{'{total}'}</code>{' '}
          <code className="rounded bg-slate-100 px-1">{'{status}'}</code>
        </p>
        <Textarea rows={3} maxLength={1000} value={form.payment_message_template} onChange={set('payment_message_template')} />
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700">Pratinjau</p>
          {preview}
        </div>
      </Panel>

      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Simpan pengaturan
        </Button>
      </div>
    </form>
  );
}

export default function AdminSettingsPage() {
  const { data, isLoading, mutate } = useSWR<Partial<Settings> & { qris_url?: string | null }>('/admin/settings', (url: string) => api.get(url));

  return (
    <>
      <AdminHeader title="Pengaturan" description="Pembayaran QRIS, batas waktu, dan notifikasi." />
      <SystemStatusPanel />
      {isLoading || !data ? (
        <div className="h-64 animate-pulse rounded-2xl bg-slate-200/70" />
      ) : (
        <SettingsForm
          initial={{ ...DEFAULTS, ...Object.fromEntries(Object.entries(data).filter(([k, v]) => v !== null && k in DEFAULTS)) }}
          qrisUrl={data.qris_url ?? null}
          onSaved={() => mutate()}
        />
      )}
    </>
  );
}
