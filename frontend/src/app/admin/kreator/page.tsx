'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Check, FileText, Percent, X } from 'lucide-react';
import { api, fetchBlobUrl } from '@/lib/api';
import { promptDialog } from '@/lib/dialog';
import { PAYOUT_STATUS, type CreatorBalance, type PayoutRow } from '@/lib/creator';
import type { Paginated } from '@/lib/types';
import { formatDateTime, formatRupiah } from '@/lib/utils';
import { AdminHeader, Button, Field, FilePicker, Input, Notice, Panel, Table, Tabs, td, th } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';

interface CreatorRow {
  id: number;
  name: string;
  email: string;
  is_blocked: boolean;
  display_name: string;
  commission_percent: number | null;
  books_count: number;
  balance: CreatorBalance;
}

export default function AdminCreatorsPage() {
  const [tab, setTab] = useState<'requested' | 'all' | 'creators'>('requested');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data: pending, mutate: refreshPending } = useSWR<Paginated<PayoutRow>>('/admin/payouts?status=requested', (url: string) => api.get(url));

  return (
    <>
      <AdminHeader
        title="Kreator"
        description={
          <>
            Kreator mengunggah & menjual bukunya sendiri. Pembayaran masuk ke Srawung; bagian kreator menjadi saldo yang ditarik lewat pengajuan di sini. Jadikan
            pengguna sebagai kreator dari halaman{' '}
            <Link href="/admin/pengguna" className="font-medium text-slate-700 underline-offset-2 hover:underline">
              Pengguna
            </Link>
            .
          </>
        }
      />
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'requested', label: 'Menunggu transfer', count: pending?.total },
            { id: 'all', label: 'Semua penarikan' },
            { id: 'creators', label: 'Daftar kreator' },
          ]}
        />
      </div>
      {tab === 'creators' ? (
        <Creators onNotice={setNotice} />
      ) : (
        <Payouts key={tab} status={tab === 'requested' ? 'requested' : ''} onNotice={(n) => (setNotice(n), refreshPending())} />
      )}
    </>
  );
}

function Payouts({ status, onNotice }: { status: string; onNotice: (n: { tone: 'success' | 'error'; text: string }) => void }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, mutate } = useSWR<Paginated<PayoutRow>>(`/admin/payouts?page=${page}${status ? `&status=${status}` : ''}`, (url: string) => api.get(url));
  const [paying, setPaying] = useState<PayoutRow | null>(null);

  const reject = async (p: PayoutRow) => {
    const note = await promptDialog({
      title: `Tolak penarikan ${formatRupiah(p.amount)}?`,
      text: 'Saldo kembali ke kreator dan kreator menerima email berisi alasannya.',
      inputLabel: 'Alasan',
      placeholder: 'mis. Nama pemilik rekening tidak sesuai',
      confirmText: 'Tolak',
    });
    if (!note) return;
    try {
      const res = await api.patch(`/admin/payouts/${p.id}/reject`, { note });
      onNotice({ tone: 'success', text: res.message });
      mutate();
    } catch (err: unknown) {
      onNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal.' });
    }
  };

  const openProof = async (p: PayoutRow) => {
    try {
      const { url } = await fetchBlobUrl(`/admin/payouts/${p.id}/proof`);
      window.open(url, '_blank', 'noopener');
    } catch {
      onNotice({ tone: 'error', text: 'Bukti transfer tidak dapat dibuka.' });
    }
  };

  return (
    <>
      <Panel className="overflow-hidden">
        <Table
          colSpan={5}
          loading={isLoading}
          empty={!data?.data.length}
          emptyText={status ? 'Tidak ada penarikan yang menunggu. 🎉' : 'Belum ada penarikan.'}
          head={
            <tr>
              <th className={th}>Kreator</th>
              <th className={th}>Transfer ke</th>
              <th className={`${th} text-right`}>Jumlah</th>
              <th className={th}>Status</th>
              <th className={th} />
            </tr>
          }
        >
          {data?.data.map((p) => (
            <tr key={p.id}>
              <td className={td}>
                <p className="font-medium text-slate-900">{p.creator?.creator_profile?.display_name ?? p.creator?.name}</p>
                <p className="text-xs text-slate-500">Diajukan {formatDateTime(p.created_at)}</p>
              </td>
              <td className={td}>
                <p className="text-slate-900">
                  {p.payout_provider} · <span className="font-mono">{p.payout_account}</span>
                </p>
                <p className="text-xs text-slate-500">a.n. {p.payout_holder}</p>
              </td>
              <td className={`${td} text-right tabular-nums`}>
                <p className="font-semibold text-slate-900">{formatRupiah(p.net_amount ?? p.amount)}</p>
                {p.fee > 0 && <p className="text-xs text-slate-500">{formatRupiah(p.amount)} − admin {formatRupiah(p.fee)}</p>}
              </td>
              <td className={td}>
                <Badge variant={PAYOUT_STATUS[p.status].variant}>{PAYOUT_STATUS[p.status].label}</Badge>
                {p.reference && <p className="mt-1 text-xs text-slate-500">Ref: {p.reference}</p>}
                {p.note && <p className="mt-1 text-xs text-rose-600">{p.note}</p>}
              </td>
              <td className={`${td} text-right`}>
                {p.status === 'requested' ? (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="success" onClick={() => setPaying(p)}>
                      <Check className="h-3.5 w-3.5" />
                      Sudah ditransfer
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => reject(p)} className="hover:bg-rose-50 hover:text-rose-600">
                      <X className="h-3.5 w-3.5" />
                      Tolak
                    </Button>
                  </div>
                ) : p.has_proof ? (
                  <Button size="sm" variant="ghost" onClick={() => openProof(p)}>
                    <FileText className="h-3.5 w-3.5" />
                    Bukti
                  </Button>
                ) : null}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />
      {paying && (
        <PaidModal
          payout={paying}
          onClose={() => setPaying(null)}
          onDone={(text) => {
            setPaying(null);
            onNotice({ tone: 'success', text });
            mutate();
          }}
        />
      )}
    </>
  );
}

function PaidModal({ payout, onClose, onDone }: { payout: PayoutRow; onClose: () => void; onDone: (t: string) => void }) {
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData();
    if (reference.trim()) fd.append('reference', reference.trim());
    if (proof) fd.append('proof', proof);
    try {
      const res = await api.post(`/admin/payouts/${payout.id}/paid`, fd);
      onDone(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Konfirmasi transfer ke kreator">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-4 text-sm">
          <p className="text-slate-500">Transfer sebesar</p>
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{formatRupiah(payout.net_amount ?? payout.amount)}</p>
          {payout.fee > 0 && (
            <p className="text-xs text-slate-500">
              Penarikan {formatRupiah(payout.amount)} − biaya admin {formatRupiah(payout.fee)}
            </p>
          )}
          <p className="mt-2 text-slate-700">
            {payout.payout_provider} · <span className="font-mono">{payout.payout_account}</span> a.n. {payout.payout_holder}
          </p>
        </div>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Field label="No. referensi transfer (opsional)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} placeholder="mis. 2611181234" />
        </Field>
        <Field label="Bukti transfer (opsional)" hint="JPG, PNG, atau PDF · maks. 20 MB">
          <FilePicker accept="image/jpeg,image/png,application/pdf" file={proof} onPick={setProof} placeholder="Pilih foto atau PDF bukti transfer" />
        </Field>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" variant="success" loading={saving}>
            Tandai sudah ditransfer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Creators({ onNotice }: { onNotice: (n: { tone: 'success' | 'error'; text: string }) => void }) {
  const { data, isLoading, mutate } = useSWR<{ default_commission: number; min_payout: number; creators: CreatorRow[] }>('/admin/creators', (url: string) => api.get(url));

  const editCommission = async (c: CreatorRow) => {
    const value = await promptDialog({
      title: `Komisi Srawung untuk ${c.display_name}`,
      text: `Kosongkan untuk memakai komisi umum (${data?.default_commission}%). Berlaku untuk penjualan berikutnya.`,
      inputLabel: 'Komisi (%)',
      placeholder: String(data?.default_commission ?? 20),
      confirmText: 'Simpan',
    });
    if (value === null) return;
    try {
      const res = await api.patch(`/admin/creators/${c.id}/commission`, { commission_percent: value.trim() === '' ? null : Number(value) });
      onNotice({ tone: 'success', text: res.message });
      mutate();
    } catch (err: unknown) {
      onNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal.' });
    }
  };

  return (
    <Panel className="overflow-hidden">
      <Table
        colSpan={5}
        loading={isLoading}
        empty={!data?.creators.length}
        emptyText="Belum ada kreator. Jadikan pengguna sebagai kreator dari halaman Pengguna."
        head={
          <tr>
            <th className={th}>Kreator</th>
            <th className={th}>Buku</th>
            <th className={`${th} text-right`}>Total pendapatan</th>
            <th className={`${th} text-right`}>Saldo</th>
            <th className={th}>Komisi Srawung</th>
          </tr>
        }
      >
        {data?.creators.map((c) => (
          <tr key={c.id}>
            <td className={td}>
              <p className="font-medium text-slate-900">{c.display_name}</p>
              <p className="text-xs text-slate-500">{c.email}</p>
            </td>
            <td className={`${td} tabular-nums`}>{c.books_count}</td>
            <td className={`${td} text-right tabular-nums`}>{formatRupiah(c.balance.earned)}</td>
            <td className={`${td} text-right`}>
              <p className="font-semibold tabular-nums text-slate-900">{formatRupiah(c.balance.available)}</p>
              {c.balance.pending > 0 && <p className="text-xs text-amber-700">{formatRupiah(c.balance.pending)} diajukan</p>}
            </td>
            <td className={td}>
              <button onClick={() => editCommission(c)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50">
                <Percent className="h-3.5 w-3.5 text-slate-400" />
                {c.commission_percent ?? data?.default_commission}%{c.commission_percent === null && <span className="text-xs text-slate-400">(umum)</span>}
              </button>
            </td>
          </tr>
        ))}
      </Table>
    </Panel>
  );
}
