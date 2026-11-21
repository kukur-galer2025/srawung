'use client';

import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, MailCheck, Pencil, Plus, Send, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog } from '@/lib/dialog';
import { formatDateTime } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, SearchInput, Table, Tabs, td, th } from '@/components/admin/ui';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import type { Paginated } from '@/lib/types';

interface Overview {
  subscribed: number;
  pending: number;
  unsubscribed: number;
  new_last_30_days: number;
  uses_gmail: boolean;
  per_minute: number;
}
interface Campaign {
  id: number;
  subject: string;
  preheader: string | null;
  body?: string;
  status: 'draft' | 'sending' | 'sent';
  recipients_count: number;
  sent_at: string | null;
  updated_at: string;
}
interface Subscriber {
  id: number;
  email: string;
  status: 'pending' | 'subscribed' | 'unsubscribed';
  source: string | null;
  user_id: number | null;
  confirmed_at: string | null;
  created_at: string;
}

const STATUS_BADGE = {
  subscribed: <Badge variant="success">Aktif</Badge>,
  pending: <Badge variant="warning">Menunggu konfirmasi</Badge>,
  unsubscribed: <Badge>Berhenti</Badge>,
};

export default function AdminNewsletterPage() {
  const [tab, setTab] = useState<'campaigns' | 'subscribers'>('campaigns');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const { data: ov, mutate: refreshOv } = useSWR<Overview>('/admin/newsletter/overview', (url: string) => api.get(url));

  return (
    <>
      <AdminHeader title="Newsletter" description="Kirim kabar buku baru & promo ke pelanggan yang sudah mengonfirmasi langganan (double opt-in)." />
      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Pelanggan aktif', ov?.subscribed],
          ['Baru 30 hari', ov?.new_last_30_days],
          ['Menunggu konfirmasi', ov?.pending],
          ['Berhenti', ov?.unsubscribed],
        ].map(([label, value]) => (
          <Panel key={label as string} className="p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value ?? '—'}</p>
          </Panel>
        ))}
      </div>

      {ov?.uses_gmail && ov.subscribed > 300 && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          Email masih dikirim lewat Gmail (batas ±500 email/hari, termasuk email transaksi). Dengan {ov.subscribed} pelanggan, sebaiknya pindah ke Brevo/Resend/SES
          sebelum mengirim newsletter.
        </div>
      )}

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'campaigns', label: 'Edisi newsletter' },
            { id: 'subscribers', label: 'Pelanggan', count: ov?.subscribed },
          ]}
        />
      </div>

      {tab === 'campaigns' ? (
        <Campaigns perMinute={ov?.per_minute ?? 20} subscribed={ov?.subscribed ?? 0} onNotice={(n) => (setNotice(n), refreshOv())} />
      ) : (
        <Subscribers onNotice={(n) => (setNotice(n), refreshOv())} />
      )}
    </>
  );
}

function Campaigns({ perMinute, subscribed, onNotice }: { perMinute: number; subscribed: number; onNotice: (n: { tone: 'success' | 'error'; text: string }) => void }) {
  const { data, isLoading, mutate } = useSWR<Campaign[]>('/admin/newsletter/campaigns', (url: string) => api.get(url), { refreshInterval: 15000 });
  const [editing, setEditing] = useState<Campaign | 'new' | null>(null);

  const act = async (fn: () => Promise<{ message?: string }>) => {
    try {
      const res = await fn();
      onNotice({ tone: 'success', text: res.message ?? 'Berhasil.' });
      mutate();
    } catch (err: unknown) {
      onNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal.' });
    }
  };

  const send = async (c: Campaign) => {
    const minutes = Math.ceil(subscribed / Math.max(1, perMinute));
    const ok = await confirmDialog({
      title: `Kirim ke ${subscribed} pelanggan?`,
      text: `"${c.subject}" dikirim bertahap (${perMinute} email/menit, ±${minutes} menit). Pastikan Anda sudah mengirim email uji. Tidak bisa dibatalkan.`,
      confirmText: 'Kirim sekarang',
    });
    if (ok) await act(() => api.post(`/admin/newsletter/campaigns/${c.id}/send`, {}));
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" />
          Tulis newsletter
        </Button>
      </div>
      <Panel className="overflow-hidden">
        <Table
          colSpan={4}
          loading={isLoading}
          empty={!data?.length}
          head={
            <tr>
              <th className={th}>Subjek</th>
              <th className={th}>Status</th>
              <th className={th}>Penerima</th>
              <th className={`${th} text-right`}>Aksi</th>
            </tr>
          }
        >
          {data?.map((c) => (
            <tr key={c.id}>
              <td className={td}>
                <p className="font-semibold text-slate-900">{c.subject}</p>
                <p className="text-xs text-slate-500">{c.sent_at ? `Dikirim ${formatDateTime(c.sent_at)}` : `Diubah ${formatDateTime(c.updated_at)}`}</p>
              </td>
              <td className={td}>
                {c.status === 'draft' ? <Badge>Draf</Badge> : c.status === 'sending' ? <Badge variant="info">Sedang dikirim</Badge> : <Badge variant="success">Terkirim</Badge>}
              </td>
              <td className={`${td} tabular-nums`}>{c.status === 'draft' ? '—' : c.recipients_count}</td>
              <td className={`${td} text-right`}>
                <div className="flex justify-end gap-1">
                  {c.status === 'draft' && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label="Ubah">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => act(() => api.post(`/admin/newsletter/campaigns/${c.id}/test`, {}))}>
                        <MailCheck className="h-3.5 w-3.5" />
                        Kirim uji
                      </Button>
                      <Button size="sm" onClick={() => send(c)} disabled={!subscribed}>
                        <Send className="h-3.5 w-3.5" />
                        Kirim
                      </Button>
                    </>
                  )}
                  {c.status !== 'sending' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label="Hapus"
                      className="hover:bg-rose-50 hover:text-rose-600"
                      onClick={async () => {
                        if (await confirmDialog({ title: 'Hapus newsletter ini?', confirmText: 'Hapus', tone: 'danger' })) act(() => api.delete(`/admin/newsletter/campaigns/${c.id}`));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      {editing && (
        <CampaignEditor
          campaign={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(msg) => {
            setEditing(null);
            onNotice({ tone: 'success', text: msg });
            mutate();
          }}
        />
      )}
    </>
  );
}

function CampaignEditor({ campaign, onClose, onSaved }: { campaign: Campaign | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [subject, setSubject] = useState(campaign?.subject ?? '');
  const [preheader, setPreheader] = useState(campaign?.preheader ?? '');
  const [body, setBody] = useState('');
  const [loaded, setLoaded] = useState(!campaign);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!campaign) return;
    api.get(`/admin/newsletter/campaigns/${campaign.id}`).then((c: Campaign) => {
      setBody(c.body ?? '');
      setLoaded(true);
    });
  }, [campaign]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { subject: subject.trim(), preheader: preheader.trim() || null, body };
      const res = campaign ? await api.put(`/admin/newsletter/campaigns/${campaign.id}`, payload) : await api.post('/admin/newsletter/campaigns', payload);
      onSaved(`${res.message} Kirim email uji untuk melihat tampilannya.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={campaign ? 'Ubah newsletter' : 'Tulis newsletter'} maxWidth="3xl">
      <form onSubmit={save} className="space-y-4">
        {error && <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        <Field label="Subjek email">
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={150} placeholder="mis. 3 buku baru + kupon khusus pelanggan" />
        </Field>
        <Field label="Teks pratinjau (opsional)" hint="Tampil di samping subjek pada daftar kotak masuk.">
          <Input value={preheader} onChange={(e) => setPreheader(e.target.value)} maxLength={150} placeholder="Diskon 20% hanya sampai Jumat" />
        </Field>
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-slate-700">Isi email</span>
          {loaded ? <RichTextEditor value={body} onChange={setBody} placeholder="Tulis isi newsletter… (sisipkan gambar sampul buku, kupon, atau tautan ke katalog)" /> : <div className="h-72 animate-pulse rounded-xl bg-slate-100" />}
          <p className="mt-1.5 text-xs text-slate-500">Tautan berhenti berlangganan ditambahkan otomatis di bagian bawah setiap email.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button type="submit" loading={saving} disabled={!loaded}>
            Simpan draf
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function Subscribers({ onNotice }: { onNotice: (n: { tone: 'success' | 'error'; text: string }) => void }) {
  const [status, setStatus] = useState<'subscribed' | 'pending' | 'unsubscribed' | ''>('subscribed');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ page: String(page) });
  if (status) qs.set('status', status);
  if (search.trim()) qs.set('search', search.trim());
  const { data, isLoading, mutate } = useSWR<Paginated<Subscriber>>(`/admin/newsletter/subscribers?${qs}`, (url: string) => api.get(url));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={status || 'all'}
          onChange={(v) => {
            setStatus(v === 'all' ? '' : (v as typeof status));
            setPage(1);
          }}
          items={[
            { id: 'subscribed', label: 'Aktif' },
            { id: 'pending', label: 'Menunggu' },
            { id: 'unsubscribed', label: 'Berhenti' },
            { id: 'all', label: 'Semua' },
          ]}
        />
        <SearchInput value={search} onChange={(v) => (setSearch(v), setPage(1))} placeholder="Cari email…" />
      </div>
      <Panel className="overflow-hidden">
        <Table
          colSpan={4}
          loading={isLoading}
          empty={!data?.data.length}
          head={
            <tr>
              <th className={th}>Email</th>
              <th className={th}>Status</th>
              <th className={th}>Sumber</th>
              <th className={`${th} text-right`} />
            </tr>
          }
        >
          {data?.data.map((s) => (
            <tr key={s.id}>
              <td className={td}>
                <p className="font-medium text-slate-900">{s.email}</p>
                <p className="text-xs text-slate-500">
                  {s.user_id ? 'Punya akun · ' : ''}Mendaftar {formatDateTime(s.created_at)}
                </p>
              </td>
              <td className={td}>{STATUS_BADGE[s.status]}</td>
              <td className={`${td} text-sm capitalize text-slate-500`}>{s.source ?? '—'}</td>
              <td className={`${td} text-right`}>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label="Hapus dari daftar"
                  className="hover:bg-rose-50 hover:text-rose-600"
                  onClick={async () => {
                    if (!(await confirmDialog({ title: `Hapus ${s.email}?`, text: 'Data langganan dihapus permanen.', confirmText: 'Hapus', tone: 'danger' }))) return;
                    const res = await api.delete(`/admin/newsletter/subscribers/${s.id}`);
                    onNotice({ tone: 'success', text: res.message });
                    mutate();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />
      <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
        <Users className="h-3.5 w-3.5" />
        Pelanggan baru mendaftar dari formulir di bagian bawah situs atau dari halaman Profil.
      </p>
    </>
  );
}
