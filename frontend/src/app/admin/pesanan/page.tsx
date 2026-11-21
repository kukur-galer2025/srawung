'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Loader2, Mail, MessageCircle, Phone, RotateCcw, X, XCircle } from 'lucide-react';
import { api, fetchBlobUrl } from '@/lib/api';
import { confirmDialog } from '@/lib/dialog';
import { formatDateTime, formatRupiah } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, SearchInput, Table, Tabs, Textarea, td, th } from '@/components/admin/ui';
import { OrderStatusBadge, orderStatusLabel } from '@/components/OrderStatus';
import { Pagination } from '@/components/Pagination';
import { Modal } from '@/components/Modal';
import { InvoiceButton } from '@/components/InvoiceButton';

type Status = 'menunggu_pembayaran' | 'menunggu_verifikasi' | 'dikonfirmasi' | 'ditolak' | 'kedaluwarsa' | 'dikembalikan';

interface OrderRow {
  id: number;
  order_number: string;
  total: number;
  status: Status;
  created_at: string;
  user?: { name: string; email: string; whatsapp?: string | null } | null;
  order_items?: { id: number }[];
  flagged_proofs_count?: number;
}

interface Proof {
  id: number;
  file_path: string;
  buyer_note?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  created_at: string;
  check?: {
    flags: string[];
    match: { order_id: number; order_number: string; order_status: string; similarity: number; same_buyer: boolean; buyer_name: string | null; uploaded_at: string } | null;
  };
}

const FLAG_LABELS: Record<string, string> = {
  bukti_identik: 'File bukti identik dengan bukti pesanan lain.',
  bukti_mirip: 'Gambar bukti sangat mirip dengan bukti pesanan lain.',
  akun_baru: 'Akun pembeli dibuat kurang dari 24 jam lalu.',
  unggah_terlalu_cepat: 'Bukti diunggah kurang dari 1 menit setelah pesanan dibuat.',
};

const REFUND_PRESETS = ['Pembeli membayar dua kali.', 'Pembayaran masuk setelah pesanan kedaluwarsa.', 'Buku tidak dapat dibaca karena kendala dari Srawung.'];

/** Peringatan hasil pemeriksaan otomatis bukti pembayaran. */
function ProofWarning({ check }: { check: NonNullable<Proof['check']> }) {
  if (!check.flags.length) return null;
  const strong = check.flags.includes('bukti_identik') || check.flags.includes('bukti_mirip');
  return (
    <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${strong ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`} role="alert">
      <p className="flex items-center gap-2 font-semibold">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {strong ? 'Bukti ini kemungkinan dipakai ulang' : 'Perlu dicek lebih teliti'}
      </p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
        {check.flags.map((f) => (
          <li key={f}>{FLAG_LABELS[f] ?? f}</li>
        ))}
      </ul>
      {check.match && (
        <p className="mt-2">
          Mirip <strong>{check.match.similarity}%</strong> dengan bukti pesanan{' '}
          <a href={`/admin/pesanan?order=${check.match.order_id}`} className="font-mono font-semibold underline">
            {check.match.order_number}
          </a>{' '}
          ({check.match.same_buyer ? 'pembeli yang sama' : `akun lain: ${check.match.buyer_name ?? '—'}`}, status {orderStatusLabel(check.match.order_status).toLowerCase()}).
          Cocokkan nomor referensi & jam transaksi di mutasi sebelum mengonfirmasi.
        </p>
      )}
    </div>
  );
}

interface OrderDetail extends OrderRow {
  payment_deadline: string;
  confirmed_at?: string | null;
  order_items: { id: number; price: number; book: { title: string } | null }[];
  payment_proofs: Proof[];
  status_logs: { id: number; from_status: string | null; to_status: string; created_at: string; actor?: { name: string } | null }[];
  coupon?: { code: string } | null;
  refunded_at?: string | null;
  refund_reason?: string | null;
  refund_reference?: string | null;
  refunded_by_user?: { name: string } | null;
}

const TABS: { id: Status | 'all'; label: string }[] = [
  { id: 'menunggu_verifikasi', label: 'Perlu verifikasi' },
  { id: 'menunggu_pembayaran', label: 'Belum bayar' },
  { id: 'dikonfirmasi', label: 'Dikonfirmasi' },
  { id: 'ditolak', label: 'Ditolak' },
  { id: 'kedaluwarsa', label: 'Kedaluwarsa' },
  { id: 'dikembalikan', label: 'Refund' },
  { id: 'all', label: 'Semua' },
];

const REJECT_PRESETS = [
  'Nominal pembayaran tidak sesuai dengan total pesanan.',
  'Bukti pembayaran tidak terbaca / buram.',
  'Pembayaran belum masuk ke mutasi QRIS kami.',
  'Pembayaran bukan ke QRIS Srawung (nama merchant berbeda).',
];

function ProofViewer({ orderId, proof }: { orderId: number; proof: Proof }) {
  const [file, setFile] = useState<{ url: string; type: string } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    fetchBlobUrl(`/admin/orders/${orderId}/proofs/${proof.id}`)
      .then((f) => {
        url = f.url;
        if (alive) setFile(f);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [orderId, proof.id]);

  if (failed) return <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">File bukti tidak dapat dimuat.</p>;
  if (!file)
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-slate-50">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );

  return (
    <div>
      {file.type.startsWith('image/') ? (
        <a href={file.url} target="_blank" rel="noopener noreferrer" className="relative block aspect-[4/3] overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200">
          <Image src={file.url} alt="Bukti pembayaran" fill sizes="400px" unoptimized className="object-contain" />
        </a>
      ) : (
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
          <FileText className="h-8 w-8 text-slate-500" />
          <span className="text-sm text-slate-700">Dokumen PDF</span>
        </div>
      )}
      <a href={file.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">
        Buka di tab baru <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

function OrderDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data: order, mutate, isLoading } = useSWR<OrderDetail>(`/admin/orders/${id}`, (url: string) => api.get(url));
  const [busy, setBusy] = useState<'confirm' | 'reject' | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [refundOpen, setRefundOpen] = useState(false);
  const [refund, setRefund] = useState({ reason: '', reference: '', revoke: true });
  const [refunding, setRefunding] = useState(false);

  const submitRefund = async () => {
    if (!order) return;
    setRefunding(true);
    setResult(null);
    try {
      const res = await api.post(`/admin/orders/${order.id}/refund`, {
        reason: refund.reason.trim(),
        reference: refund.reference.trim() || null,
        revoke_access: refund.revoke,
      });
      setRefundOpen(false);
      setResult({ tone: 'success', text: `${res.message} Email pemberitahuan dikirim ke ${order.user?.email}.` });
      await mutate();
      onChanged();
    } catch (err: unknown) {
      setResult({ tone: 'error', text: err instanceof Error ? err.message : 'Refund gagal.' });
    } finally {
      setRefunding(false);
    }
  };
  const [result, setResult] = useState<{ tone: 'success' | 'error'; text: string; wa?: string | null } | null>(null);

  const act = async (kind: 'confirm' | 'reject') => {
    if (!order) return;
    if (kind === 'confirm') {
      const ok = await confirmDialog({
        title: 'Konfirmasi pembayaran?',
        text: `Pesanan ${order.order_number} senilai ${formatRupiah(order.total)}. Akses buku langsung aktif dan email konfirmasi dikirim ke ${order.user?.email ?? 'pembeli'}.`,
        confirmText: 'Ya, konfirmasi',
        tone: 'success',
      });
      if (!ok) return;
    }
    setBusy(kind);
    setResult(null);
    try {
      const res =
        kind === 'confirm'
          ? await api.patch(`/admin/orders/${order.id}/confirm`, {})
          : await api.patch(`/admin/orders/${order.id}/reject`, { reason: reason.trim() });
      setRejectOpen(false);
      setReason('');
      setResult({
        tone: 'success',
        text:
          kind === 'confirm'
            ? `Pesanan dikonfirmasi. Email konfirmasi sedang dikirim ke ${order.user?.email}.`
            : `Pesanan ditolak. Email berisi alasan penolakan sedang dikirim ke ${order.user?.email}.`,
        wa: res.whatsapp_url,
      });
      await mutate();
      onChanged();
    } catch (err: unknown) {
      setResult({ tone: 'error', text: err instanceof Error ? err.message : 'Aksi gagal.' });
    } finally {
      setBusy(null);
    }
  };

  const proofs = order?.payment_proofs ?? [];
  const latest = proofs.length ? proofs[proofs.length - 1] : null;
  const canAct = order && (order.status === 'menunggu_verifikasi' || order.status === 'menunggu_pembayaran');

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Detail pesanan">
      <div className="modal-backdrop absolute inset-0 bg-slate-950/40" onClick={onClose} />
      <aside className="modal-panel absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <p className="font-mono text-sm font-semibold text-slate-900">{order?.order_number ?? '…'}</p>
            {order && <p className="text-xs text-slate-500">{formatDateTime(order.created_at)}</p>}
          </div>
          <div className="flex items-center gap-2">
            {order && <OrderStatusBadge status={order.status} />}
            <button onClick={onClose} aria-label="Tutup" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {isLoading || !order ? (
            <Loader2 className="mx-auto mt-10 h-6 w-6 animate-spin text-blue-600" />
          ) : (
            <>
              {result && (
                <Notice tone={result.tone}>
                  <p className="flex items-start gap-2">
                    {result.tone === 'success' ? <Mail className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                    {result.text}
                  </p>
                  {result.wa && (
                    <a href={result.wa} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 font-semibold underline">
                      <MessageCircle className="h-4 w-4" />
                      Kirim juga via WhatsApp
                    </a>
                  )}
                </Notice>
              )}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Pembeli</h3>
                <p className="font-semibold text-slate-900">{order.user?.name}</p>
                <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                  <Mail className="h-4 w-4 text-slate-400" />
                  {order.user?.email}
                </p>
                {order.user?.whatsapp && (
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                    <Phone className="h-4 w-4 text-slate-400" />
                    {order.user.whatsapp}
                  </p>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Item</h3>
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {order.order_items.map((it) => (
                    <li key={it.id} className="flex justify-between gap-3 px-4 py-2.5 text-sm">
                      <span className="text-slate-800">{it.book?.title ?? 'Buku dihapus'}</span>
                      <span className="tabular-nums text-slate-600">{formatRupiah(it.price)}</span>
                    </li>
                  ))}
                  <li className="flex justify-between bg-slate-50 px-4 py-2.5 text-sm">
                    <span className="text-slate-600">
                      Total{order.coupon ? ` (kupon ${order.coupon.code})` : ''}
                    </span>
                    <span className="font-bold tabular-nums text-slate-900">{formatRupiah(order.total)}</span>
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Bukti pembayaran</h3>
                {latest ? (
                  <>
                    {latest.check && <ProofWarning check={latest.check} />}
                    <ProofViewer orderId={order.id} proof={latest} />
                    <p className="mt-2 text-xs text-slate-500">Diunggah {formatDateTime(latest.created_at)}</p>
                    {latest.buyer_note && (
                      <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        <strong>Catatan pembeli:</strong> {latest.buyer_note}
                      </p>
                    )}
                    {latest.rejection_reason && (
                      <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
                        <strong>Alasan ditolak:</strong> {latest.rejection_reason}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Pembeli belum mengunggah bukti.</p>
                )}
              </section>

              {order.status === 'dikembalikan' && (
                <section className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-900">Dana sudah dikembalikan</p>
                  <p className="mt-1">{order.refund_reason}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {order.refunded_at && formatDateTime(order.refunded_at)}
                    {order.refunded_by_user?.name ? ` · ${order.refunded_by_user.name}` : ''}
                    {order.refund_reference ? ` · Ref ${order.refund_reference}` : ''}
                  </p>
                </section>
              )}

              <InvoiceButton path={`/admin/orders/${order.id}/invoice`} orderNumber={order.order_number} className="w-full" />

              {order.status === 'dikonfirmasi' && (
                <button
                  onClick={() => setRefundOpen(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"
                >
                  <RotateCcw className="h-4 w-4" />
                  Refund pesanan ini
                </button>
              )}

              {order.status_logs?.length > 0 && (
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Riwayat</h3>
                  <ol className="space-y-3 border-l border-slate-200 pl-4">
                    {order.status_logs.map((l) => (
                      <li key={l.id} className="relative text-sm">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 ring-4 ring-white" />
                        <p className="font-medium text-slate-800">{orderStatusLabel(l.to_status)}</p>
                        <p className="text-xs text-slate-500">
                          {formatDateTime(l.created_at)}
                          {l.actor?.name ? ` · ${l.actor.name}` : ''}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </>
          )}
        </div>

        {canAct && (
          <div className="flex gap-3 border-t border-slate-100 p-4">
            <Button variant="success" className="flex-1" loading={busy === 'confirm'} disabled={!!busy} onClick={() => act('confirm')}>
              <CheckCircle2 className="h-4 w-4" />
              Konfirmasi
            </Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => setRejectOpen(true)} className="text-rose-700">
              <XCircle className="h-4 w-4" />
              Tolak
            </Button>
          </div>
        )}
      </aside>

      <Modal isOpen={refundOpen} onClose={() => setRefundOpen(false)} title="Refund pesanan">
        <p className="mb-4 text-sm text-slate-600">
          Transfer dulu dananya ({order ? formatRupiah(order.total) : ''}) ke pembeli secara manual, lalu catat di sini. Pendapatan kreator dari pesanan ini otomatis dikoreksi, dan pembeli serta kreator menerima email.
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          {REFUND_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setRefund((r) => ({ ...r, reason: p }))}
              className={`rounded-full border px-3 py-1 text-xs transition ${refund.reason === p ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="space-y-4">
          <Field label="Alasan refund">
            <Textarea rows={2} maxLength={500} value={refund.reason} onChange={(e) => setRefund((r) => ({ ...r, reason: e.target.value }))} placeholder="Dikirim ke email pembeli" />
          </Field>
          <Field label="No. referensi transfer balik (opsional)">
            <Input value={refund.reference} maxLength={120} onChange={(e) => setRefund((r) => ({ ...r, reference: e.target.value }))} />
          </Field>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={refund.revoke} onChange={(e) => setRefund((r) => ({ ...r, revoke: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-rose-600" />
            <span>
              Cabut akses baca buku dari pesanan ini
              <span className="block text-xs text-slate-500">Matikan bila pembeli tetap boleh membaca (mis. pembayaran ganda: pesanan lain sudah aktif).</span>
            </span>
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRefundOpen(false)}>
            Batal
          </Button>
          <Button variant="danger" loading={refunding} disabled={refund.reason.trim().length < 5} onClick={submitRefund}>
            Tandai sudah di-refund
          </Button>
        </div>
      </Modal>

      <Modal isOpen={rejectOpen} onClose={() => setRejectOpen(false)} title="Tolak bukti pembayaran">
        <p className="mb-4 text-sm text-slate-600">Alasan ini dikirim ke email pembeli agar mereka tahu apa yang harus diperbaiki.</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {REJECT_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setReason(p)}
              className={`rounded-full border px-3 py-1 text-xs transition ${reason === p ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
            >
              {p}
            </button>
          ))}
        </div>
        <Textarea rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tulis alasan penolakan…" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRejectOpen(false)}>
            Batal
          </Button>
          <Button variant="danger" loading={busy === 'reject'} disabled={!reason.trim()} onClick={() => act('reject')}>
            Tolak & kirim email
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function OrdersContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTab] = useState<Status | 'all'>('menunggu_verifikasi');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const selected = params.get('order') ? Number(params.get('order')) : null;

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page) });
  if (tab !== 'all') qs.set('status', tab);
  if (debounced) qs.set('search', debounced);
  const { data, isLoading, mutate } = useSWR<{ data: OrderRow[]; last_page: number; total: number }>(`/admin/orders?${qs}`, (url: string) => api.get(url));
  const rows = data?.data ?? [];

  const open = (id: number | null) => router.replace(id ? `/admin/pesanan?order=${id}` : '/admin/pesanan', { scroll: false });

  return (
    <>
      <AdminHeader
        title="Verifikasi pesanan"
        description="Cocokkan bukti pembayaran QRIS dengan mutasi merchant, lalu konfirmasi atau tolak. Pembeli otomatis menerima email."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Cari no. pesanan, nama, email…" />}
      />

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(v) => {
            setTab(v);
            setPage(1);
          }}
          items={TABS.map((t) => ({ ...t, count: t.id === tab ? data?.total : undefined }))}
        />
      </div>

      <Panel className="overflow-hidden">
        <Table
          colSpan={5}
          loading={isLoading}
          empty={!rows.length}
          head={
            <tr>
              <th className={th}>Pesanan</th>
              <th className={th}>Pembeli</th>
              <th className={`${th} text-right`}>Total</th>
              <th className={th}>Status</th>
              <th className={th}></th>
            </tr>
          }
        >
          {rows.map((o) => (
            <tr key={o.id} onClick={() => open(o.id)} className="cursor-pointer transition hover:bg-slate-50">
              <td className={td}>
                <p className="flex items-center gap-1.5 font-mono text-sm font-medium text-slate-900">
                  {o.order_number}
                  {(o.flagged_proofs_count ?? 0) > 0 && (
                    <span title="Bukti pembayaran perlu dicek lebih teliti" className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 font-sans text-[11px] font-semibold text-rose-700">
                      <AlertTriangle className="h-3 w-3" />
                      Cek
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  {formatDateTime(o.created_at)} · {o.order_items?.length ?? 0} buku
                </p>
              </td>
              <td className={td}>
                <p className="font-medium text-slate-900">{o.user?.name ?? '—'}</p>
                <p className="text-xs text-slate-500">{o.user?.email}</p>
              </td>
              <td className={`${td} text-right font-semibold tabular-nums text-slate-900`}>{formatRupiah(o.total)}</td>
              <td className={td}>
                <OrderStatusBadge status={o.status} />
              </td>
              <td className={`${td} text-right`}>
                <span className="text-sm font-semibold text-blue-700">{o.status === 'menunggu_verifikasi' ? 'Periksa →' : 'Detail →'}</span>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />

      {selected && <OrderDrawer id={selected} onClose={() => open(null)} onChanged={() => mutate()} />}
    </>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersContent />
    </Suspense>
  );
}
