'use client';

import React, { use, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import useSWR from 'swr';
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FileText,
  Hourglass,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, formatRupiah } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { BookCover } from '@/components/BookCard';
import { Card } from '@/components/PageHeader';
import { OrderStatusBadge } from '@/components/OrderStatus';
import { InvoiceButton } from '@/components/InvoiceButton';
import { track } from '@/lib/analytics';
import { showFlash } from '@/lib/flash';

type Status = 'menunggu_pembayaran' | 'menunggu_verifikasi' | 'dikonfirmasi' | 'ditolak' | 'kedaluwarsa' | 'dikembalikan';

interface OrderDetail {
  id: number;
  order_number: string;
  total: number;
  status: Status;
  payment_deadline: string;
  created_at: string;
  order_items: {
    id: number;
    price: number;
    book: { id: number; title: string; slug: string; author?: string; cover_url: string | null } | null;
    bundle?: { id: number; title: string; slug: string } | null;
  }[];
  payment_proofs?: { id: number; status: 'pending' | 'approved' | 'rejected'; rejection_reason?: string | null; created_at: string }[];
  coupon?: { code: string } | null;
  refunded_at?: string | null;
  refund_reason?: string | null;
  refund_reference?: string | null;
}

interface PaymentInfo {
  method: 'qris';
  merchant_name: string;
  nmid: string;
  qris_url: string | null;
  whatsapp_admin: string;
}

const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPT = ['image/jpeg', 'image/png', 'application/pdf'];

function useCountdown(deadline?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [deadline]);
  if (!deadline) return null;
  const diff = Math.max(0, new Date(deadline).getTime() - now);
  return { h: Math.floor(diff / 3.6e6), m: Math.floor((diff % 3.6e6) / 6e4), s: Math.floor((diff % 6e4) / 1000), over: diff === 0 };
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } catch {
          /* abaikan */
        }
      }}
      aria-label={`Salin ${label}`}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition ${
        copied ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
      }`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? 'Tersalin' : 'Salin'}
    </button>
  );
}

export default function OrderPaymentPage({ params }: { params: Promise<{ nomor: string }> }) {
  const { nomor } = use(params);
  const { user } = useAuth();
  const { data, error, isLoading, mutate } = useSWR<{ order: OrderDetail; payment_info: PaymentInfo }>(`/orders/${encodeURIComponent(nomor)}`, (url: string) =>
    api.get(url)
  );
  const order = data?.order;
  const payment = data?.payment_info;
  const awaitingBuyer = order?.status === 'menunggu_pembayaran' || order?.status === 'ditolak';
  const countdown = useCountdown(awaitingBuyer ? order?.payment_deadline : undefined);
  const deadlinePassed = !!countdown?.over;

  // Analitik: pembelian dicatat sekali per pesanan setelah dikonfirmasi admin.
  useEffect(() => {
    if (order?.status !== 'dikonfirmasi') return;
    const key = `amania_tracked_${order.order_number}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return;
    }
    track('purchase', {
      transaction_id: order.order_number,
      currency: 'IDR',
      value: order.total,
      coupon: order.coupon?.code,
      items: (order.order_items ?? []).map((it) => ({ item_id: String(it.book?.id ?? it.id), item_name: it.book?.title, price: it.price, quantity: 1 })),
    });
  }, [order]);

  // Batas waktu habis saat halaman terbuka → ambil status terbaru (server mengubahnya jadi kedaluwarsa).
  useEffect(() => {
    if (deadlinePassed) mutate();
  }, [deadlinePassed, mutate]);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [justUploaded, setJustUploaded] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const pickFile = (f: File | undefined) => {
    setUploadError(null);
    if (!f) return;
    if (!ACCEPT.includes(f.type)) return setUploadError('Format harus JPG, PNG, atau PDF.');
    if (f.size > MAX_SIZE) return setUploadError('Ukuran file maksimal 5 MB.');
    setFile(f);
    setPreviewUrl(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || !file) return setUploadError('Pilih file bukti pembayaran terlebih dahulu.');
    setUploading(true);
    setUploadError(null);
    const form = new FormData();
    form.append('proof', file);
    if (note.trim()) form.append('buyer_note', note.trim());
    try {
      await api.post(`/orders/${order.id}/proof`, form);
      setJustUploaded(true);
      setFile(null);
      setPreviewUrl(null);
      setNote('');
      await mutate();
      showFlash({
        tone: 'success',
        title: 'Bukti pembayaran terkirim',
        description: 'Tim kami memverifikasi dalam 1×24 jam kerja. Kami kabari lewat email.',
        duration: 6000,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah bukti pembayaran.';
      setUploadError(msg);
      showFlash({ tone: 'error', title: 'Bukti gagal diunggah', description: msg });
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-7 w-7 animate-spin text-blue-700" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <Card className="p-10 text-center">
        <AlertCircle className="mx-auto mb-3 h-8 w-8 text-rose-500" />
        <h1 className="font-display text-xl font-semibold text-slate-900">Pesanan tidak ditemukan</h1>
        <p className="mt-1 text-sm text-slate-500">Pesanan ini tidak ada atau bukan milik akun Anda.</p>
        <Link href="/pesanan" className="mt-6 inline-flex h-11 items-center rounded-xl bg-blue-700 px-5 text-sm font-semibold text-white">
          Lihat semua pesanan
        </Link>
      </Card>
    );
  }

  const items = order.order_items ?? [];
  const subtotal = items.reduce((s, i) => s + Number(i.price || 0), 0);
  const discount = Math.max(0, subtotal - order.total);
  const lastProof = order.payment_proofs?.length ? order.payment_proofs[order.payment_proofs.length - 1] : null;
  const canUpload = order.status === 'menunggu_pembayaran' || order.status === 'ditolak';
  const waLink = (msg: string) => `https://wa.me/${payment?.whatsapp_admin ?? ''}?text=${encodeURIComponent(msg)}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link href="/pesanan" className="mb-3 inline-block text-sm font-medium text-slate-500 hover:text-slate-900">
            ← Semua pesanan
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl font-medium tracking-tight text-slate-900 sm:text-3xl">Pembayaran</h1>
            <OrderStatusBadge status={order.status} />
          </div>
          <p className="mt-1.5 text-sm text-slate-500">
            <span className="font-mono font-medium text-slate-700">{order.order_number}</span> · {formatDateTime(order.created_at)}
          </p>
        </div>
        {countdown && !countdown.over && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
            <Clock className="h-5 w-5 text-amber-600" />
            <div>
              <p className="text-xs text-amber-800">{order.status === 'ditolak' ? 'Unggah ulang sebelum' : 'Bayar sebelum'}</p>
              <p className="font-mono text-lg font-bold tabular-nums text-amber-900">
                {String(countdown.h).padStart(2, '0')}:{String(countdown.m).padStart(2, '0')}:{String(countdown.s).padStart(2, '0')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Progres */}
      <Stepper status={order.status} />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Status panel */}
          {order.status === 'dikonfirmasi' && (
            <StatusPanel tone="success" icon={CheckCircle2} title="Pembayaran dikonfirmasi">
              Buku sudah aktif di perpustakaan Anda. Email konfirmasi telah dikirim ke <strong className="wrap-anywhere">{user?.email}</strong>.
              <Link href="/perpustakaan" className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white hover:bg-emerald-700">
                <BookOpen className="h-4 w-4" />
                Buka perpustakaan
              </Link>
            </StatusPanel>
          )}
          {order.status === 'menunggu_verifikasi' && (
            <StatusPanel tone="info" icon={Hourglass} title={justUploaded ? 'Bukti berhasil dikirim' : 'Bukti sedang diverifikasi'}>
              Tim kami sedang mencocokkan pembayaran QRIS Anda, biasanya selesai dalam 1×24 jam pada hari kerja.
              <span className="mt-3 flex items-start gap-2 rounded-xl bg-white/60 px-3 py-2.5 text-sm">
                <Mail className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0">
                  Tanda terima telah dikirim ke <strong className="wrap-anywhere">{user?.email}</strong>. Kami akan mengirim email lagi saat pembayaran dikonfirmasi.
                </span>
              </span>
            </StatusPanel>
          )}
          {order.status === 'ditolak' && (
            <StatusPanel tone="danger" icon={XCircle} title="Bukti pembayaran ditolak">
              {lastProof?.rejection_reason ? (
                <>
                  Catatan admin: <strong>{lastProof.rejection_reason}</strong>
                </>
              ) : (
                'Bukti belum dapat diverifikasi.'
              )}
              <span className="mt-1 block">Silakan unggah ulang bukti yang sesuai di bawah.</span>
            </StatusPanel>
          )}
          {order.status === 'dikembalikan' && (
            <StatusPanel tone="neutral" icon={Clock} title="Dana pesanan ini sudah dikembalikan">
              {order.refund_reason}
              {order.refund_reference && <span className="mt-1 block">No. referensi transfer: {order.refund_reference}</span>}
            </StatusPanel>
          )}
          {order.status === 'kedaluwarsa' && (
            <StatusPanel tone="neutral" icon={Clock} title="Pesanan kedaluwarsa">
              Batas waktu pembayaran telah lewat. Silakan buat pesanan baru dari katalog.
            </StatusPanel>
          )}

          {/* Bayar dengan QRIS */}
          {canUpload && payment && <QrisCard payment={payment} total={order.total} orderNumber={order.order_number} />}

          {/* Unggah bukti */}
          {canUpload && (
            <Card>
              <div className="border-b border-slate-100 px-6 py-4">
                <h2 className="font-sans text-base font-semibold text-slate-900">2. Unggah bukti pembayaran</h2>
                <p className="mt-0.5 text-xs text-slate-500">Tangkapan layar struk/notifikasi berhasil dari aplikasi pembayaran Anda.</p>
              </div>
              <form onSubmit={upload} className="space-y-4 p-6">
                {uploadError && (
                  <p role="alert" className="flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    {uploadError}
                  </p>
                )}

                <label
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    pickFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
                    dragging ? 'border-blue-500 bg-blue-50' : file ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-white'
                  }`}
                >
                  <input type="file" accept={ACCEPT.join(',')} className="sr-only" onChange={(e) => pickFile(e.target.files?.[0])} />
                  {file ? (
                    <>
                      {previewUrl ? (
                        <span className="relative mb-3 block h-36 w-28 overflow-hidden rounded-lg ring-1 ring-slate-200">
                          <Image src={previewUrl} alt="Pratinjau bukti" fill sizes="112px" unoptimized className="object-cover" />
                        </span>
                      ) : (
                        <FileText className="mb-3 h-10 w-10 text-slate-500" />
                      )}
                      <span className="max-w-full truncate text-sm font-semibold text-slate-900">{file.name}</span>
                      <span className="mt-1 text-xs text-slate-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB · klik untuk mengganti
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
                        <UploadCloud className="h-6 w-6 text-blue-700" />
                      </span>
                      <span className="text-sm font-semibold text-slate-900">Klik atau seret file ke sini</span>
                      <span className="mt-1 text-xs text-slate-500">JPG, PNG, atau PDF · maks. 5 MB</span>
                    </>
                  )}
                </label>

                <div>
                  <label htmlFor="note" className="mb-1.5 block text-sm font-semibold text-slate-700">
                    Catatan <span className="font-normal text-slate-400">(opsional)</span>
                  </label>
                  <textarea
                    id="note"
                    rows={2}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Contoh: dibayar lewat GoPay a.n. Budi Santoso"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-sm outline-none transition focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
                  />
                </div>

                <button
                  type="submit"
                  disabled={uploading || !file}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(29,78,216,0.8)] transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : order.status === 'ditolak' ? <RefreshCw className="h-[18px] w-[18px]" /> : <UploadCloud className="h-[18px] w-[18px]" />}
                  {uploading ? 'Mengunggah…' : order.status === 'ditolak' ? 'Kirim ulang bukti' : 'Kirim bukti pembayaran'}
                </button>
                <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
                  <Mail className="h-3.5 w-3.5" />
                  Tanda terima otomatis dikirim ke email Anda
                </p>
              </form>
            </Card>
          )}
        </div>

        {/* Ringkasan */}
        <Card className="p-6 lg:sticky lg:top-24">
          <h2 className="mb-4 font-sans text-base font-semibold text-slate-900">Ringkasan pesanan</h2>
          <ul className="space-y-4">
            {items.map((it) => (
              <li key={it.id} className="flex gap-3">
                <span className="relative aspect-[3/4.3] w-12 shrink-0 overflow-hidden rounded-md ring-1 ring-slate-900/5">
                  <BookCover title={it.book?.title ?? 'Buku'} src={it.book?.cover_url ?? null} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{it.book?.title ?? 'Buku'}</p>
                  {it.bundle && <p className="mt-0.5 truncate text-xs font-medium text-brand-orange">Paket: {it.bundle.title}</p>}
                  <p className="mt-1 text-sm text-slate-500">{formatRupiah(it.price)}</p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal</dt>
              <dd>{formatRupiah(subtotal)}</dd>
            </div>
            {discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Diskon{order.coupon?.code ? ` (${order.coupon.code})` : ''}</dt>
                <dd>−{formatRupiah(discount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
              <dt className="font-semibold text-slate-900">Total bayar</dt>
              <dd className="text-xl font-bold text-slate-900">{formatRupiah(order.total)}</dd>
            </div>
          </dl>
          <InvoiceButton
            path={`/orders/${encodeURIComponent(order.order_number)}/invoice`}
            orderNumber={order.order_number}
            label={order.status === 'dikonfirmasi' ? 'Unduh invoice lunas' : 'Unduh invoice'}
            className="mt-6 h-11 w-full"
          />
          {payment?.whatsapp_admin && (
            <a
              href={waLink(`Halo Admin Srawung, saya ingin bertanya tentang pesanan ${order.order_number}.`)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              Hubungi admin
            </a>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Unduh gambar lintas-origin (atribut download diabaikan browser untuk origin lain). */
async function downloadImage(url: string, filename: string) {
  try {
    const blob = await fetch(url).then((r) => {
      if (!r.ok) throw new Error();
      return r.blob();
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

function QrisCard({ payment, total, orderNumber }: { payment: PaymentInfo; total: number; orderNumber: string }) {
  const [zoom, setZoom] = useState(false);
  const amount = String(total);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="font-sans text-base font-semibold text-slate-900">1. Bayar dengan QRIS</h2>
          <p className="mt-0.5 text-xs text-slate-500">Bisa dari semua m-banking & e-wallet: GoPay, OVO, DANA, ShopeePay, LinkAja, BCA, dan lainnya.</p>
        </div>
        <span className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-extrabold tracking-[0.18em] text-slate-700">QRIS</span>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,240px)_1fr] md:gap-8">
        {/* Gambar QRIS */}
        <div className="mx-auto w-full max-w-[260px]">
          {payment.qris_url ? (
            <button
              type="button"
              onClick={() => setZoom(true)}
              className="group relative block w-full overflow-hidden rounded-2xl bg-white p-2 shadow-[0_20px_50px_-25px_rgba(15,23,42,0.45)] ring-1 ring-slate-200 transition duration-500 ease-luxe hover:-translate-y-0.5"
              aria-label="Perbesar QRIS"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- gambar QRIS dari server, harus tajam tanpa kompresi ulang */}
              <img src={payment.qris_url} alt={`QRIS ${payment.merchant_name}`} className="h-auto w-full rounded-xl" />
              <span className="absolute inset-x-2 bottom-2 flex h-8 items-center justify-center rounded-lg bg-slate-900/80 text-xs font-semibold text-white opacity-0 backdrop-blur transition group-hover:opacity-100">
                Klik untuk memperbesar
              </span>
            </button>
          ) : (
            <div className="flex aspect-[3/4] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              QRIS belum tersedia. Hubungi admin untuk instruksi pembayaran.
            </div>
          )}
          {payment.qris_url && (
            <button
              type="button"
              onClick={() => downloadImage(payment.qris_url!, `QRIS-Srawung-${orderNumber}.webp`)}
              className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Simpan gambar QRIS
            </button>
          )}
        </div>

        {/* Nominal & langkah */}
        <div className="min-w-0">
          <div className="rounded-2xl bg-navy p-5 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-200">Nominal yang harus dibayar</p>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <p className="font-display text-3xl font-medium tabular-nums tracking-tight sm:text-[2.1rem]">{formatRupiah(total)}</p>
              <CopyButton value={amount} label="nominal" />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">
              Bayar <strong className="text-white">tepat sebesar nominal ini</strong>, lalu unggah bukti pembayaran di bawah agar pesanan segera diverifikasi.
            </p>
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <dt className="text-xs text-slate-500">Nama merchant</dt>
              <dd className="mt-0.5 font-semibold text-slate-900">{payment.merchant_name}</dd>
            </div>
            <div className="rounded-xl bg-slate-50 px-4 py-3">
              <dt className="text-xs text-slate-500">NMID</dt>
              <dd className="mt-0.5 break-all font-mono text-xs font-semibold text-slate-900">{payment.nmid}</dd>
            </div>
          </dl>

          <ol className="mt-5 space-y-3 text-sm text-slate-600">
            {[
              <>Buka aplikasi m-banking atau e-wallet, pilih <strong className="text-slate-900">Bayar / Scan QRIS</strong>.</>,
              <>
                Pindai kode di samping. <span className="md:hidden">Membuka dari HP ini? Tekan <strong className="text-slate-900">Simpan gambar QRIS</strong>, lalu pilih gambar dari galeri di aplikasi pembayaran.</span>
                <span className="hidden md:inline">Pastikan nama merchant <strong className="text-slate-900">{payment.merchant_name}</strong>.</span>
              </>,
              <>Ketik nominal <strong className="text-slate-900">{formatRupiah(total)}</strong>, lalu konfirmasi pembayaran.</>,
              <>Simpan tangkapan layar bukti berhasil, kemudian unggah di bawah.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-orange/10 text-xs font-bold text-brand-orange">{i + 1}</span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {zoom && payment.qris_url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QRIS diperbesar"
          className="modal-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={() => setZoom(false)}
        >
          <div className="modal-panel relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- lihat catatan di atas */}
            <img src={payment.qris_url} alt={`QRIS ${payment.merchant_name}`} className="h-auto w-full rounded-2xl bg-white p-3 shadow-2xl" />
            <p className="mt-3 text-center text-sm text-white">
              Bayar tepat <strong>{formatRupiah(total)}</strong>
            </p>
            <button
              type="button"
              onClick={() => setZoom(false)}
              className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-700 shadow-lg"
              aria-label="Tutup"
            >
              <XCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

const PANEL_TONES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900 [&_svg.lead]:text-emerald-600',
  info: 'border-blue-200 bg-blue-50 text-blue-900 [&_svg.lead]:text-blue-600',
  danger: 'border-rose-200 bg-rose-50 text-rose-900 [&_svg.lead]:text-rose-600',
  neutral: 'border-slate-200 bg-slate-100 text-slate-800 [&_svg.lead]:text-slate-500',
};

function StatusPanel({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: keyof typeof PANEL_TONES;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex gap-4 rounded-2xl border p-5 ${PANEL_TONES[tone]}`}>
      <Icon className="lead mt-0.5 h-6 w-6 shrink-0" />
      <div className="min-w-0 text-sm leading-relaxed">
        <p className="mb-1 text-base font-semibold">{title}</p>
        <div className="flex flex-col items-start">{children}</div>
      </div>
    </div>
  );
}

const STEPS: { key: string; label: string }[] = [
  { key: 'order', label: 'Pesanan dibuat' },
  { key: 'pay', label: 'Bayar QRIS & unggah bukti' },
  { key: 'verify', label: 'Verifikasi admin' },
  { key: 'done', label: 'Siap dibaca' },
];

function Stepper({ status }: { status: Status }) {
  const current = ({ menunggu_pembayaran: 1, ditolak: 1, kedaluwarsa: 1, menunggu_verifikasi: 2, dikonfirmasi: 4, dikembalikan: 4 } as Record<Status, number>)[status] ?? 1;
  return (
    <ol className="grid grid-cols-4 gap-2">
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={s.key} className="flex flex-col gap-2">
            <span className={`h-1.5 rounded-full ${done ? 'bg-blue-700' : active ? 'bg-blue-300' : 'bg-slate-200'}`} />
            <span className={`hidden text-xs sm:block ${done || active ? 'font-semibold text-slate-900' : 'text-slate-400'}`}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
