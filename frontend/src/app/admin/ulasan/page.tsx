'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog, promptDialog } from '@/lib/dialog';
import { formatDateTime } from '@/lib/utils';
import { AdminHeader, Button, Notice, Panel, SearchInput, Tabs } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { Pagination } from '@/components/Pagination';
import { Stars } from '@/components/StarRating';
import type { Paginated } from '@/lib/types';

interface AdminReview {
  id: number;
  rating: number;
  title: string | null;
  body: string | null;
  is_hidden: boolean;
  hidden_reason: string | null;
  created_at: string;
  user?: { id: number; name: string; email: string } | null;
  book?: { id: number; title: string; slug: string } | null;
}

export default function AdminReviewsPage() {
  const [status, setStatus] = useState<'all' | 'visible' | 'hidden'>('all');
  const [rating, setRating] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page) });
  if (status !== 'all') qs.set('status', status);
  if (rating) qs.set('rating', rating);
  if (debounced) qs.set('search', debounced);
  const { data, isLoading, mutate } = useSWR<Paginated<AdminReview>>(`/admin/reviews?${qs}`, (url: string) => api.get(url));
  const rows = data?.data ?? [];

  const run = async (fn: () => Promise<{ message?: string }>) => {
    try {
      const res = await fn();
      setNotice({ tone: 'success', text: res.message ?? 'Berhasil.' });
      await mutate();
    } catch (err: unknown) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal memproses ulasan.' });
    }
  };

  const hide = async (r: AdminReview) => {
    const reason = await promptDialog({
      title: 'Sembunyikan ulasan?',
      text: 'Ulasan tidak tampil publik dan tidak dihitung dalam rating. Pengulas melihat alasannya di halaman buku.',
      inputLabel: 'Alasan (opsional)',
      placeholder: 'mis. Mengandung promosi / kata kasar / tidak relevan',
      confirmText: 'Sembunyikan',
    });
    if (reason === null) return;
    await run(() => api.patch(`/admin/reviews/${r.id}/hide`, { reason: reason || null }));
  };

  const remove = async (r: AdminReview) => {
    const ok = await confirmDialog({ title: 'Hapus ulasan permanen?', text: 'Pengulas dapat menulis ulasan baru setelahnya.', confirmText: 'Hapus', tone: 'danger' });
    if (ok) await run(() => api.delete(`/admin/reviews/${r.id}`));
  };

  return (
    <>
      <AdminHeader
        title="Ulasan"
        description="Moderasi ulasan pembeli. Ulasan langsung tampil; sembunyikan bila melanggar pedoman."
        actions={<SearchInput value={search} onChange={setSearch} placeholder="Cari judul buku atau isi ulasan…" />}
      />

      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          items={[
            { id: 'all', label: 'Semua' },
            { id: 'visible', label: 'Tampil' },
            { id: 'hidden', label: 'Disembunyikan' },
          ]}
        />
        <select
          value={rating}
          onChange={(e) => {
            setRating(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
          aria-label="Filter rating"
        >
          <option value="">Semua bintang</option>
          {[5, 4, 3, 2, 1].map((r) => (
            <option key={r} value={r}>
              {r} bintang
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <Panel className="h-48 animate-pulse" >
          <span className="sr-only">Memuat…</span>
        </Panel>
      ) : rows.length === 0 ? (
        <Panel className="p-10 text-center text-sm text-slate-500">Belum ada ulasan.</Panel>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Panel key={r.id} className={`p-5 ${r.is_hidden ? 'opacity-70' : ''}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Stars value={r.rating} size={15} />
                    {r.is_hidden ? <Badge variant="danger">Disembunyikan</Badge> : <Badge variant="success">Tampil</Badge>}
                  </div>
                  {r.book && (
                    <Link href={`/buku/${r.book.slug}#ulasan`} target="_blank" className="mt-2 block text-sm font-semibold text-blue-700 hover:underline">
                      {r.book.title}
                    </Link>
                  )}
                  {r.title && <p className="mt-2 font-semibold text-slate-900">{r.title}</p>}
                  {r.body && <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{r.body}</p>}
                  <p className="mt-3 text-xs text-slate-500">
                    {r.user?.name ?? 'Pengguna terhapus'} · {r.user?.email} · {formatDateTime(r.created_at)}
                  </p>
                  {r.is_hidden && r.hidden_reason && <p className="mt-1 text-xs text-rose-600">Alasan: {r.hidden_reason}</p>}
                </div>
                <div className="flex shrink-0 gap-1">
                  {r.is_hidden ? (
                    <Button size="sm" variant="secondary" onClick={() => run(() => api.patch(`/admin/reviews/${r.id}/unhide`))}>
                      <Eye className="h-3.5 w-3.5" />
                      Tampilkan
                    </Button>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => hide(r)}>
                      <EyeOff className="h-3.5 w-3.5" />
                      Sembunyikan
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => remove(r)} aria-label="Hapus ulasan" className="hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />
    </>
  );
}
