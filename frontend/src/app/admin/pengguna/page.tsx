'use client';

import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Ban, MessageCircle, MonitorSmartphone, ShieldCheck, Unlock } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { formatDateTime } from '@/lib/utils';
import { api } from '@/lib/api';
import { confirmDialog, promptDialog } from '@/lib/dialog';
import { formatDate } from '@/lib/utils';
import { AdminHeader, Button, Notice, Panel, SearchInput, Table, Tabs, td, th } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { Avatar } from '@/components/Navbar';
import { Pagination } from '@/components/Pagination';

interface AdminUser {
  id: number;
  name: string;
  email: string;
  whatsapp: string | null;
  avatar: string | null;
  google_id: string | null;
  role: 'buyer' | 'creator' | 'admin';
  is_blocked: boolean;
  email_verified_at: string | null;
  created_at: string;
  orders_count: number;
  user_libraries_count: number;
  flags_count?: number;
}

interface Activity {
  flags: { id: number; reason: string; created_at: string; book?: { title: string } | null; details?: { ip?: string; agent?: string; limit?: number } | null }[];
  active_sessions: { id: number; started_at: string; last_seen_at: string | null; ip_address: string; device: string | null; book?: { title: string } | null }[];
  pages_last_24h: number;
  pages_last_hour: number;
}

const FLAG_LABELS: Record<string, string> = {
  rate_menit: 'Membuka halaman terlalu cepat (per menit)',
  rate_jam: 'Melewati batas wajar per jam',
  rate_hari: 'Melewati batas wajar per hari',
};

function shortDevice(ua: string | null) {
  if (!ua) return 'Perangkat tidak dikenal';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iOS' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : 'Lainnya';
  const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Peramban';
  return `${br} · ${os}`;
}

function ActivityModal({ user, onClose, onEnded }: { user: AdminUser; onClose: () => void; onEnded: (msg: string) => void }) {
  const { data, mutate } = useSWR<Activity>(`/admin/users/${user.id}/activity`, (url: string) => api.get(url));
  const [ending, setEnding] = useState(false);

  const endSessions = async () => {
    const ok = await confirmDialog({
      title: `Akhiri semua sesi baca ${user.name}?`,
      text: 'Pembaca harus membuka ulang bukunya. Gunakan bila Anda mencurigai akun dipakai bersama.',
      confirmText: 'Akhiri sesi',
      tone: 'danger',
    });
    if (!ok) return;
    setEnding(true);
    try {
      const res = await api.post(`/admin/users/${user.id}/end-reading-sessions`, {});
      await mutate();
      onEnded(res.message ?? 'Sesi diakhiri.');
    } finally {
      setEnding(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Aktivitas baca · ${user.name}`} maxWidth="2xl">
      {!data ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-3">
            {[
              ['Halaman 1 jam terakhir', data.pages_last_hour],
              ['Halaman 24 jam terakhir', data.pages_last_24h],
              ['Sesi aktif', data.active_sessions.length],
            ].map(([label, value]) => (
              <div key={label as string} className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold text-slate-900">Catatan mencurigakan (30 hari)</p>
            {data.flags.length ? (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {data.flags.map((f) => (
                  <li key={f.id} className="flex items-start gap-3 p-3 text-sm">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{FLAG_LABELS[f.reason] ?? f.reason}</p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(f.created_at)}
                        {f.book ? ` · ${f.book.title}` : ''}
                        {f.details?.ip ? ` · IP ${f.details.ip}` : ''}
                        {f.details?.agent ? ` · ${shortDevice(f.details.agent)}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Tidak ada aktivitas mencurigakan.</p>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Perangkat yang sedang membaca</p>
              {data.active_sessions.length > 0 && (
                <Button size="sm" variant="danger" loading={ending} onClick={endSessions}>
                  Akhiri semua sesi
                </Button>
              )}
            </div>
            {data.active_sessions.length ? (
              <ul className="space-y-2">
                {data.active_sessions.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm">
                    <MonitorSmartphone className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{s.book?.title ?? 'Buku'}</p>
                      <p className="text-xs text-slate-500">
                        {shortDevice(s.device)} · IP {s.ip_address} · terakhir aktif {formatDateTime(s.last_seen_at ?? s.started_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Tidak ada sesi aktif.</p>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            Batas otomatis: 30 halaman/menit, 360/jam, 1.500/hari per akun (tanpa batas perangkat). Pelanggaran tercatat di sini.
          </p>
        </div>
      )}
    </Modal>
  );
}

function waNumber(n: string) {
  const d = n.replace(/\D/g, '');
  return d.startsWith('0') ? `62${d.slice(1)}` : d;
}

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState<'all' | 'buyer' | 'creator' | 'admin' | 'flagged'>('buyer');
  const [activityUser, setActivityUser] = useState<AdminUser | null>(null);
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page) });
  if (debounced) qs.set('search', debounced);
  if (role === 'flagged') qs.set('flagged', '1');
  else if (role !== 'all') qs.set('role', role);
  const { data, isLoading, mutate } = useSWR<{ data: AdminUser[]; last_page: number; total: number }>(`/admin/users?${qs}`, (url: string) => api.get(url));
  const users = data?.data ?? [];

  const toggleCreator = async (u: AdminUser) => {
    const enabling = u.role !== 'creator';
    let displayName: string | null = null;
    if (enabling) {
      displayName = await promptDialog({
        title: `Jadikan ${u.name} kreator?`,
        text: 'Kreator bisa mengunggah & menjual bukunya sendiri serta membuat voucher untuk bukunya. Bagian Srawung mengikuti komisi di Pengaturan.',
        inputLabel: 'Nama kreator / nama pena',
        placeholder: u.name,
        confirmText: 'Jadikan kreator',
      });
      if (displayName === null) return;
    } else {
      const ok = await confirmDialog({
        title: `Cabut akses kreator ${u.name}?`,
        text: 'Bukunya tetap dijual dan dikelola admin. Saldo tetap tercatat dan bisa dibayarkan.',
        confirmText: 'Cabut',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setBusyId(u.id);
    try {
      const res = await api.patch(`/admin/users/${u.id}/creator`, { enabled: enabling, display_name: displayName?.trim() || null });
      setNotice({ tone: 'success', text: res.message });
      await mutate();
    } catch (err: unknown) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal memperbarui pengguna.' });
    } finally {
      setBusyId(null);
    }
  };

  const toggleBlock = async (u: AdminUser) => {
    const ok = await confirmDialog(
      u.is_blocked
        ? {
            title: `Buka blokir ${u.name}?`,
            text: 'Pengguna ini bisa masuk dan berbelanja lagi.',
            confirmText: 'Buka blokir',
          }
        : {
            title: `Blokir ${u.name}?`,
            text: 'Pengguna tidak bisa masuk, dan semua sesi login aktifnya langsung dikeluarkan.',
            confirmText: 'Blokir pengguna',
            tone: 'danger',
          }
    );
    if (!ok) return;
    setBusyId(u.id);
    try {
      const res = await api.patch(`/admin/users/${u.id}/${u.is_blocked ? 'unblock' : 'block'}`);
      setNotice({ tone: 'success', text: res.message ?? 'Status pengguna diperbarui.' });
      await mutate();
    } catch (err: unknown) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal memperbarui pengguna.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <AdminHeader title="Pengguna" description={`${data?.total ?? 0} akun`} actions={<SearchInput value={search} onChange={setSearch} placeholder="Cari nama, email, WhatsApp…" />} />

      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="mb-4">
        <Tabs
          value={role}
          onChange={(v) => {
            setRole(v);
            setPage(1);
          }}
          items={[
            { id: 'buyer', label: 'Pembeli' },
            { id: 'creator', label: 'Kreator' },
            { id: 'admin', label: 'Admin' },
            { id: 'all', label: 'Semua' },
            { id: 'flagged', label: 'Aktivitas mencurigakan' },
          ]}
        />
      </div>

      <Panel className="overflow-hidden">
        <Table
          colSpan={5}
          loading={isLoading}
          empty={!users.length}
          head={
            <tr>
              <th className={th}>Pengguna</th>
              <th className={th}>Kontak</th>
              <th className={th}>Aktivitas</th>
              <th className={th}>Status</th>
              <th className={th}></th>
            </tr>
          }
        >
          {users.map((u) => (
            <tr key={u.id} className="hover:bg-slate-50/60">
              <td className={td}>
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} src={u.avatar} size={36} />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-semibold text-slate-900">
                      {u.name}
                      {u.role === 'admin' && <ShieldCheck className="h-4 w-4 text-blue-600" aria-label="Admin" />}
                    </p>
                    <p className="text-xs text-slate-500">Bergabung {formatDate(u.created_at)}</p>
                  </div>
                </div>
              </td>
              <td className={td}>
                <p className="text-slate-700">{u.email}</p>
                {u.whatsapp ? (
                  <a href={`https://wa.me/${waNumber(u.whatsapp)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:underline">
                    <MessageCircle className="h-3 w-3" />
                    {u.whatsapp}
                  </a>
                ) : (
                  <p className="text-xs text-slate-400">WhatsApp belum diisi</p>
                )}
              </td>
              <td className={`${td} text-slate-600`}>
                <p>{u.orders_count} pesanan</p>
                <p className="text-xs text-slate-400">{u.user_libraries_count} buku dimiliki</p>
              </td>
              <td className={td}>
                <div className="flex flex-wrap gap-1.5">
                  {u.is_blocked ? (
                    <Badge variant="danger" dot>
                      Diblokir
                    </Badge>
                  ) : (
                    <Badge variant="success" dot>
                      Aktif
                    </Badge>
                  )}
                  {!u.email_verified_at && <Badge variant="warning">Email belum verif.</Badge>}
                  {u.google_id && <Badge>Google</Badge>}
                  {u.role === 'creator' && <Badge variant="purple">Kreator</Badge>}
                  {!!u.flags_count && (
                    <button onClick={() => setActivityUser(u)} title="Lihat aktivitas baca">
                      <Badge variant="warning" dot>
                        {u.flags_count} catatan mencurigakan
                      </Badge>
                    </button>
                  )}
                </div>
              </td>
              <td className={`${td} text-right`}>
                {u.role !== 'admin' && (
                  <Button size="sm" variant="ghost" onClick={() => setActivityUser(u)} className="mr-1">
                    Aktivitas
                  </Button>
                )}
                {u.role !== 'admin' && (
                  <Button size="sm" variant="ghost" loading={busyId === u.id} onClick={() => toggleCreator(u)} className="mr-1 text-violet-700 hover:bg-violet-50">
                    {u.role === 'creator' ? 'Cabut kreator' : 'Jadikan kreator'}
                  </Button>
                )}
                {u.role !== 'admin' && (
                  <Button size="sm" variant={u.is_blocked ? 'secondary' : 'ghost'} loading={busyId === u.id} onClick={() => toggleBlock(u)} className={u.is_blocked ? '' : 'text-rose-600 hover:bg-rose-50'}>
                    {u.is_blocked ? <Unlock className="h-3.5 w-3.5" /> : <Ban className="h-3.5 w-3.5" />}
                    {u.is_blocked ? 'Buka blokir' : 'Blokir'}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />

      {activityUser && (
        <ActivityModal
          user={activityUser}
          onClose={() => setActivityUser(null)}
          onEnded={(msg) => setNotice({ tone: 'success', text: msg })}
        />
      )}
    </>
  );
}
