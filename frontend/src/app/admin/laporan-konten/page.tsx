'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ExternalLink, ShieldAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { AdminHeader, Button, Field, Notice, Panel, Tabs, Textarea } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';

type ReportStatus = 'baru' | 'ditinjau' | 'diterima' | 'ditolak';

interface ReportRow {
  id: number;
  reporter_name: string;
  reporter_email: string;
  type: string;
  relationship: string;
  description: string;
  evidence_url: string | null;
  status: ReportStatus;
  admin_note: string | null;
  resolved_at: string | null;
  created_at: string;
  book: { id: number; title: string; slug: string; status: string; author: string; creator?: { name: string } | null } | null;
  resolver?: { name: string } | null;
}

interface ReportPage {
  data: ReportRow[];
  last_page: number;
  counts: Partial<Record<ReportStatus, number>>;
  types: Record<string, string>;
  relationships: Record<string, string>;
}

const STATUS: Record<ReportStatus, { label: string; variant: 'warning' | 'info' | 'success' | 'default' }> = {
  baru: { label: 'Baru', variant: 'warning' },
  ditinjau: { label: 'Sedang ditinjau', variant: 'info' },
  diterima: { label: 'Diterima · buku diturunkan', variant: 'success' },
  ditolak: { label: 'Ditolak', variant: 'default' },
};

export default function ContentReportsPage() {
  const [tab, setTab] = useState<'aktif' | 'diterima' | 'ditolak'>('aktif');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<ReportRow | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data, isLoading, mutate } = useSWR<ReportPage>(`/admin/book-reports?status=${tab}&page=${page}`, (url: string) => api.get(url));
  const active = (data?.counts.baru ?? 0) + (data?.counts.ditinjau ?? 0);

  return (
    <>
      <AdminHeader
        title="Laporan konten"
        description="Laporan pelanggaran hak cipta atau konten terlarang dari pengunjung. Tinjau maksimal 3 hari kerja — pelapor dan kreator menerima email keputusan."
      />
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={(v) => (setTab(v), setPage(1))}
          items={[
            { id: 'aktif', label: 'Perlu ditinjau', count: active },
            { id: 'diterima', label: 'Diterima', count: data?.counts.diterima },
            { id: 'ditolak', label: 'Ditolak', count: data?.counts.ditolak },
          ]}
        />
      </div>

      {isLoading ? (
        <Panel className="p-10 text-center text-sm text-slate-500">Memuat…</Panel>
      ) : !data?.data.length ? (
        <Panel className="flex flex-col items-center gap-2 p-10 text-center">
          <ShieldAlert className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">{tab === 'aktif' ? 'Tidak ada laporan yang perlu ditinjau.' : 'Belum ada laporan di sini.'}</p>
        </Panel>
      ) : (
        <ul className="space-y-3">
          {data.data.map((r) => (
            <li key={r.id}>
              <Panel className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={STATUS[r.status].variant}>{STATUS[r.status].label}</Badge>
                      <span className="text-xs font-semibold text-rose-700">{data.types[r.type] ?? r.type}</span>
                      <span className="text-xs text-slate-400">#{r.id} · {formatDateTime(r.created_at)}</span>
                    </div>
                    <p className="mt-2 font-semibold text-slate-900">
                      {r.book?.title ?? 'Buku dihapus'}
                      {r.book && r.book.status !== 'published' && <span className="ml-2 text-xs font-medium text-slate-500">(tidak dijual)</span>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {r.book?.creator ? `Kreator: ${r.book.creator.name}` : 'Terbitan Srawung'} · Pelapor: {r.reporter_name} ({data.relationships[r.relationship] ?? r.relationship})
                    </p>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-700">{r.description}</p>
                  </div>
                  <Button variant={r.status === 'baru' || r.status === 'ditinjau' ? 'primary' : 'secondary'} size="sm" onClick={() => setOpen(r)} className="shrink-0">
                    {r.status === 'baru' || r.status === 'ditinjau' ? 'Tinjau' : 'Detail'}
                  </Button>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />

      {open && data && (
        <ReviewModal
          report={open}
          types={data.types}
          relationships={data.relationships}
          onClose={() => setOpen(null)}
          onDone={(text) => {
            setOpen(null);
            setNotice({ tone: 'success', text });
            mutate();
          }}
        />
      )}
    </>
  );
}

function ReviewModal({
  report,
  types,
  relationships,
  onClose,
  onDone,
}: {
  report: ReportRow;
  types: Record<string, string>;
  relationships: Record<string, string>;
  onClose: () => void;
  onDone: (text: string) => void;
}) {
  const [note, setNote] = useState(report.admin_note ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decided = report.status === 'diterima' || report.status === 'ditolak';

  const act = async (action: 'review' | 'reject' | 'takedown') => {
    setBusy(action);
    setError(null);
    try {
      const res = await api.patch(`/admin/book-reports/${report.id}`, { action, note: note.trim() || null });
      onDone(res.message);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan keputusan.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Laporan #${report.id}`} maxWidth="xl">
      <div className="space-y-4 text-sm">
        <div className="rounded-xl bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{types[report.type] ?? report.type}</p>
          <p className="mt-1 font-semibold text-slate-900">{report.book?.title}</p>
          <p className="text-xs text-slate-500">
            {report.book?.author}
            {report.book?.creator ? ` · kreator ${report.book.creator.name}` : ' · terbitan Srawung'}
          </p>
          {report.book && (
            <Link href={`/buku/${report.book.slug}`} target="_blank" className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline">
              Buka halaman buku <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Pelapor</p>
          <p className="mt-1 text-slate-800">
            {report.reporter_name} · {relationships[report.relationship] ?? report.relationship}
          </p>
          <a href={`mailto:${report.reporter_email}`} className="text-xs text-blue-700 hover:underline">
            {report.reporter_email}
          </a>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Uraian</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{report.description}</p>
          {report.evidence_url && (
            <a href={report.evidence_url} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex items-center gap-1 break-all text-xs font-semibold text-blue-700 hover:underline">
              {report.evidence_url} <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          )}
        </div>

        {decided ? (
          <div className="rounded-xl border border-slate-200 p-4">
            <p className="font-semibold text-slate-900">{STATUS[report.status].label}</p>
            <p className="mt-1 text-slate-700">{report.admin_note}</p>
            <p className="mt-1 text-xs text-slate-500">
              {report.resolved_at && formatDateTime(report.resolved_at)}
              {report.resolver?.name ? ` · ${report.resolver.name}` : ''}
            </p>
          </div>
        ) : (
          <>
            <Field label="Catatan keputusan" hint="Dikirim ke pelapor; bila buku diturunkan, juga ke kreatornya.">
              <Textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. Terbukti bab 2–4 identik dengan buku pelapor (ISBN …)." />
            </Field>
            {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-rose-700">{error}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              {report.status === 'baru' && (
                <Button variant="ghost" loading={busy === 'review'} disabled={!!busy} onClick={() => act('review')}>
                  Tandai sedang ditinjau
                </Button>
              )}
              <Button variant="secondary" loading={busy === 'reject'} disabled={!!busy || !note.trim()} onClick={() => act('reject')}>
                Tolak laporan
              </Button>
              <Button variant="danger" loading={busy === 'takedown'} disabled={!!busy || !note.trim()} onClick={() => act('takedown')}>
                Terima & turunkan buku
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
