'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { confirmDialog } from '@/lib/dialog';
import { PAYOUT_STATUS, type CreatorEarningRow, type CreatorProfileData, type CreatorSummary, type PayoutRow } from '@/lib/creator';
import type { Paginated } from '@/lib/types';
import { formatDateTime, formatRupiah } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, PanelHeader, Select, Stat, Table, Tabs, Textarea, td, th } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { Pagination } from '@/components/Pagination';

export default function CreatorEarningsPage() {
  const { data: summary, mutate: refreshSummary } = useSWR<CreatorSummary>('/creator/summary', (url: string) => api.get(url));
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [tab, setTab] = useState<'payouts' | 'sales'>('payouts');
  const b = summary?.balance;

  return (
    <>
      <AdminHeader
        title="Pendapatan"
        description={
          summary
            ? `Pembeli membayar ke Srawung lewat QRIS. Bagian Anda (${100 - summary.commission_percent}%) masuk ke saldo setelah pembayaran dikonfirmasi, lalu bisa ditarik ke rekening/e-wallet Anda.`
            : 'Memuat…'
        }
      />
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      {b && b.debt > 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Ada koreksi refund sebesar <strong>{formatRupiah(b.debt)}</strong> setelah saldo Anda ditarik. Jumlah ini otomatis dipotong dari penjualan berikutnya sebelum saldo bisa
          ditarik lagi.
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo bisa ditarik" value={b ? formatRupiah(b.available) : '—'} tone={b && b.available >= (summary?.min_payout ?? 0) ? 'attention' : 'default'} />
        <Stat label="Sedang diproses" value={b ? formatRupiah(b.pending) : '—'} />
        <Stat label="Sudah ditransfer" value={b ? formatRupiah(b.paid) : '—'} />
        <Stat label="Total pendapatan" value={b ? formatRupiah(b.earned) : '—'} hint={b ? `dari penjualan ${formatRupiah(b.gross)}${b.reversed ? ` · dikoreksi ${formatRupiah(b.reversed)}` : ''}` : undefined} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <PayoutRequestCard summary={summary} onDone={(text) => (setNotice({ tone: 'success', text }), refreshSummary())} onError={(text) => setNotice({ tone: 'error', text })} />
        <ProfileCard profile={summary?.profile ?? null} onSaved={(text) => (setNotice({ tone: 'success', text }), refreshSummary())} onError={(text) => setNotice({ tone: 'error', text })} />
      </div>

      <div className="mb-4 mt-8">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'payouts', label: 'Riwayat penarikan' },
            { id: 'sales', label: 'Rincian penjualan' },
          ]}
        />
      </div>
      {tab === 'payouts' ? <PayoutHistory key={b?.pending} /> : <SalesHistory />}
    </>
  );
}

function PayoutRequestCard({ summary, onDone, onError }: { summary?: CreatorSummary; onDone: (t: string) => void; onError: (t: string) => void }) {
  const [amount, setAmount] = useState('');
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const available = summary?.balance.available ?? 0;
  const min = summary?.min_payout ?? 100000;
  const fee = summary?.payout_fee ?? 0;
  const p = summary?.profile;
  const hasAccount = !!(p?.payout_method && p.payout_provider && p.payout_account && p.payout_holder);
  const pending = (summary?.balance.pending ?? 0) > 0;
  const value = Number(amount) || 0;
  const valid = value >= min && value <= available;
  const short = Math.max(0, min - available);
  const disabled = !hasAccount || pending || available < min;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await confirmDialog({
      title: `Tarik ${formatRupiah(value)}?`,
      text: `Setelah biaya admin ${formatRupiah(fee)}, sebesar ${formatRupiah(value - fee)} ditransfer ke ${p?.payout_provider} ${p?.payout_account} a.n. ${p?.payout_holder}. Pastikan data rekening sudah benar.`,
      confirmText: 'Ajukan penarikan',
    });
    if (!ok) return;
    setSending(true);
    try {
      const res = await api.post('/creator/payouts', { amount: value, agree });
      setAmount('');
      setAgree(false);
      onDone(res.message);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Gagal mengajukan penarikan.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Panel>
      <PanelHeader title="Tarik saldo" description={`Minimal ${formatRupiah(min)} · biaya admin ${formatRupiah(fee)} · diproses 1–3 hari kerja`} />
      <form onSubmit={submit} className="space-y-4 p-5">
        {!hasAccount && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Isi rekening atau e-wallet di kartu &ldquo;Profil &amp; rekening pencairan&rdquo; terlebih dahulu.</p>}
        {pending && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">Ada penarikan yang sedang diproses. Pengajuan berikutnya bisa dilakukan setelah selesai.</p>}
        {hasAccount && !pending && available < min && (
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
            <p>
              Saldo bisa ditarik setelah mencapai <strong className="text-slate-900">{formatRupiah(min)}</strong>. Kurang {formatRupiah(short)} lagi.
            </p>
            <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-slate-200">
              <span className="block h-full rounded-full bg-violet-500" style={{ width: `${Math.min(100, Math.round((available / min) * 100))}%` }} />
            </span>
          </div>
        )}
        <Field label="Jumlah ditarik (Rp)" hint={`Saldo tersedia ${formatRupiah(available)}`}>
          <div className="flex gap-2">
            <Input type="number" min={min} max={available} step={1000} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(min)} disabled={disabled} />
            <Button type="button" variant="secondary" onClick={() => setAmount(String(available))} disabled={disabled}>
              Semua
            </Button>
          </div>
        </Field>

        <dl className="space-y-1.5 rounded-lg border border-slate-200 p-3 text-sm">
          <div className="flex justify-between gap-3 text-slate-600">
            <dt>Jumlah ditarik</dt>
            <dd className="tabular-nums">{formatRupiah(valid ? value : 0)}</dd>
          </div>
          <div className="flex justify-between gap-3 text-slate-600">
            <dt>Biaya admin</dt>
            <dd className="tabular-nums">−{formatRupiah(fee)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-slate-100 pt-1.5 font-semibold text-slate-900">
            <dt>Diterima di rekening</dt>
            <dd className="tabular-nums">{formatRupiah(valid ? value - fee : 0)}</dd>
          </div>
        </dl>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-slate-600">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} disabled={disabled} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-violet-600" />
          <span>
            Saya setuju biaya admin {formatRupiah(fee)} dipotong dari penarikan ini, sesuai{' '}
            <Link href="/syarat-kreator" target="_blank" className="font-semibold text-blue-700 hover:underline">
              S&amp;K Kreator
            </Link>
            .
          </span>
        </label>
        <Button type="submit" loading={sending} disabled={disabled || !valid || !agree} className="w-full">
          Ajukan penarikan
        </Button>
      </form>
    </Panel>
  );
}

function ProfileCard({ profile, onSaved, onError }: { profile: CreatorProfileData | null; onSaved: (t: string) => void; onError: (t: string) => void }) {
  const [form, setForm] = useState({ display_name: '', bio: '', payout_method: 'bank', payout_provider: '', payout_account: '', payout_holder: '' });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!profile || loaded) return;
    const t = setTimeout(() => {
      setForm({
        display_name: profile.display_name ?? '',
        bio: profile.bio ?? '',
        payout_method: profile.payout_method ?? 'bank',
        payout_provider: profile.payout_provider ?? '',
        payout_account: profile.payout_account ?? '',
        payout_holder: profile.payout_holder ?? '',
      });
      setLoaded(true);
    }, 0);
    return () => clearTimeout(t);
  }, [profile, loaded]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.put('/creator/profile', form);
      onSaved(res.message);
    } catch (err: unknown) {
      onError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel>
      <PanelHeader title="Profil & rekening pencairan" />
      <form onSubmit={save} className="space-y-4 p-5">
        <Field label="Nama kreator / nama pena">
          <Input value={form.display_name} onChange={set('display_name')} required maxLength={100} />
        </Field>
        <Field label="Bio singkat (opsional)">
          <Textarea rows={2} value={form.bio} onChange={set('bio')} maxLength={1000} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jenis">
            <Select value={form.payout_method} onChange={set('payout_method')}>
              <option value="bank">Rekening bank</option>
              <option value="ewallet">E-wallet</option>
            </Select>
          </Field>
          <Field label={form.payout_method === 'bank' ? 'Nama bank' : 'Nama e-wallet'}>
            <Input value={form.payout_provider} onChange={set('payout_provider')} placeholder={form.payout_method === 'bank' ? 'BCA, BRI, Mandiri…' : 'DANA, OVO, GoPay…'} required />
          </Field>
          <Field label={form.payout_method === 'bank' ? 'Nomor rekening' : 'Nomor HP e-wallet'}>
            <Input inputMode="numeric" value={form.payout_account} onChange={set('payout_account')} required />
          </Field>
          <Field label="Atas nama">
            <Input value={form.payout_holder} onChange={set('payout_holder')} required />
          </Field>
        </div>
        <div className="flex justify-end">
          <Button type="submit" loading={saving}>
            Simpan
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function PayoutHistory() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<Paginated<PayoutRow>>(`/creator/payouts?page=${page}`, (url: string) => api.get(url));
  return (
    <Panel className="overflow-hidden">
      <Table
        colSpan={4}
        loading={isLoading}
        empty={!data?.data.length}
        emptyText="Belum ada penarikan."
        head={
          <tr>
            <th className={th}>Tanggal</th>
            <th className={th}>Tujuan</th>
            <th className={`${th} text-right`}>Diterima</th>
            <th className={th}>Status</th>
          </tr>
        }
      >
        {data?.data.map((p) => (
          <tr key={p.id}>
            <td className={`${td} whitespace-nowrap text-slate-600`}>{formatDateTime(p.created_at)}</td>
            <td className={td}>
              {p.payout_provider} · {p.payout_account}
              {p.note && <p className="text-xs text-rose-600">Alasan: {p.note}</p>}
              {p.reference && <p className="text-xs text-slate-500">Ref: {p.reference}</p>}
            </td>
            <td className={`${td} text-right tabular-nums`}>
              <p className="font-semibold text-slate-900">{formatRupiah(p.net_amount ?? p.amount)}</p>
              {p.fee > 0 && (
                <p className="text-xs text-slate-500">
                  {formatRupiah(p.amount)} − admin {formatRupiah(p.fee)}
                </p>
              )}
            </td>
            <td className={td}>
              <Badge variant={PAYOUT_STATUS[p.status].variant}>{PAYOUT_STATUS[p.status].label}</Badge>
            </td>
          </tr>
        ))}
      </Table>
      <div className="px-4 pb-3">
        <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />
      </div>
    </Panel>
  );
}

function SalesHistory() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<Paginated<CreatorEarningRow>>(`/creator/earnings?page=${page}`, (url: string) => api.get(url));
  return (
    <Panel className="overflow-hidden">
      <Table
        colSpan={5}
        loading={isLoading}
        empty={!data?.data.length}
        emptyText="Belum ada penjualan terkonfirmasi."
        head={
          <tr>
            <th className={th}>Tanggal</th>
            <th className={th}>Buku</th>
            <th className={`${th} text-right`}>Dibayar pembeli</th>
            <th className={`${th} text-right`}>Komisi Srawung</th>
            <th className={`${th} text-right`}>Untuk Anda</th>
          </tr>
        }
      >
        {data?.data.map((e) => (
          <tr key={e.id} className={e.reversed_at ? 'bg-slate-50/60 text-slate-400' : undefined}>
            <td className={`${td} whitespace-nowrap text-slate-600`}>{formatDateTime(e.created_at)}</td>
            <td className={td}>
              <p className="line-clamp-1 font-medium text-slate-900">{e.book?.title ?? 'Buku'}</p>
              <p className="font-mono text-[11px] text-slate-400">{e.order?.order_number}</p>
              {e.reversed_at && (
                <p className="mt-0.5 text-xs font-medium text-rose-600" title={e.reversal_reason ?? undefined}>
                  Dikoreksi (refund) · {formatDateTime(e.reversed_at)}
                </p>
              )}
            </td>
            <td className={`${td} text-right tabular-nums`}>{formatRupiah(e.gross)}</td>
            <td className={`${td} text-right tabular-nums text-slate-500`}>
              −{formatRupiah(e.commission)} <span className="text-xs">({e.commission_percent}%)</span>
            </td>
            <td className={`${td} text-right font-semibold tabular-nums ${e.reversed_at ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{formatRupiah(e.net)}</td>
          </tr>
        ))}
      </Table>
      <div className="px-4 pb-3">
        <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />
      </div>
    </Panel>
  );
}
