'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ExternalLink, Layers, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog } from '@/lib/dialog';
import { formatRupiah } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, Textarea } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { BookCover } from '@/components/BookCard';
import type { BookSummary, Paginated } from '@/lib/types';

interface AdminBundle {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  is_active: boolean;
  is_available: boolean;
  starts_at: string | null;
  ends_at: string | null;
  sold: number;
  individual_total: number;
  savings: number;
  savings_percent: number;
  books: { id: number; title: string; cover_url: string | null; effective_price: number }[];
}

const EMPTY = { title: '', description: '', price: '', is_active: true, starts_at: '', ends_at: '' };

/** ISO → nilai input datetime-local di zona waktu perangkat. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function AdminBundlesPage() {
  const { data, isLoading, mutate } = useSWR<AdminBundle[]>('/admin/bundles', (url: string) => api.get(url));
  const { data: catalog } = useSWR<Paginated<BookSummary>>('/books?per_page=48', (url: string) => api.get(url));
  const books = useMemo(() => catalog?.data ?? [], [catalog]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBundle | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [picked, setPicked] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);
  const individual = picked.reduce((s, id) => s + (bookMap.get(id)?.effective_price ?? bookMap.get(id)?.price ?? 0), 0);
  const price = Number(form.price) || 0;
  const savingsPct = individual > 0 && price > 0 ? Math.round(((individual - price) / individual) * 100) : 0;

  const openForm = (b?: AdminBundle) => {
    setEditing(b ?? null);
    setForm(
      b
        ? { title: b.title, description: b.description ?? '', price: String(b.price), is_active: b.is_active, starts_at: toLocalInput(b.starts_at), ends_at: toLocalInput(b.ends_at) }
        : EMPTY
    );
    setPicked(b ? b.books.map((x) => x.id) : []);
    setQuery('');
    setError(null);
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const body = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      price,
      is_active: form.is_active,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      book_ids: picked,
    };
    try {
      const res = editing ? await api.put(`/admin/bundles/${editing.id}`, body) : await api.post('/admin/bundles', body);
      setNotice(res.message);
      setOpen(false);
      mutate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan paket.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: AdminBundle) => {
    if (!(await confirmDialog({ title: `Hapus paket "${b.title}"?`, text: 'Riwayat pesanan tetap tersimpan.', confirmText: 'Hapus', tone: 'danger' }))) return;
    const res = await api.delete(`/admin/bundles/${b.id}`);
    setNotice(res.message);
    mutate();
  };

  const filtered = books.filter((b) => !query || b.title.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <AdminHeader
        title="Paket hemat"
        description="Gabungkan beberapa buku dengan satu harga. Buku yang sudah dimiliki pembeli otomatis dikurangi dari harga paket."
        actions={
          <Button onClick={() => openForm()}>
            <Plus className="h-4 w-4" />
            Buat paket
          </Button>
        }
      />
      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      {isLoading ? (
        <Panel className="h-48 animate-pulse">
          <span className="sr-only">Memuat…</span>
        </Panel>
      ) : !data?.length ? (
        <Panel className="p-10 text-center">
          <Layers className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-900">Belum ada paket</p>
          <p className="mt-1 text-sm text-slate-500">Contoh: &ldquo;Paket Web Developer&rdquo; berisi PHP + Laravel dengan harga lebih hemat.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((b) => (
            <Panel key={b.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{b.title}</p>
                    {b.is_available ? <Badge variant="success">Tampil</Badge> : <Badge variant="default">{b.is_active ? 'Di luar periode' : 'Nonaktif'}</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    <span className="text-slate-400 line-through">{formatRupiah(b.individual_total)}</span> →{' '}
                    <strong className="text-slate-900">{formatRupiah(b.price)}</strong> · hemat {b.savings_percent}% · terjual {b.sold}×
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link href={`/paket/${b.slug}`} target="_blank" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Lihat di toko">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <Button size="sm" variant="ghost" onClick={() => openForm(b)} aria-label="Ubah paket">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(b)} aria-label="Hapus paket" className="hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                {b.books.map((bk) => (
                  <span key={bk.id} title={bk.title} className="relative aspect-[3/4.3] w-12 shrink-0 overflow-hidden rounded-md ring-1 ring-slate-900/5">
                    <BookCover title={bk.title} src={bk.cover_url} sizes="48px" />
                  </span>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Ubah paket' : 'Buat paket'} maxWidth="2xl">
        <form onSubmit={save} className="space-y-4">
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}
          <Field label="Nama paket">
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required maxLength={120} placeholder="mis. Paket Web Developer" />
          </Field>
          <Field label="Deskripsi (opsional)">
            <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} maxLength={1000} />
          </Field>

          <Field label={`Buku dalam paket (${picked.length} dipilih, minimal 2)`}>
            <div className="rounded-xl border border-slate-200">
              {picked.length > 0 && (
                <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
                  {picked.map((id) => (
                    <span key={id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 py-1 pl-3 pr-1 text-xs font-medium text-blue-800">
                      {bookMap.get(id)?.title.split(':')[0] ?? `Buku #${id}`}
                      <button type="button" onClick={() => setPicked((p) => p.filter((x) => x !== id))} className="rounded-full p-0.5 hover:bg-blue-100" aria-label="Keluarkan">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative border-b border-slate-100">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari judul buku…" className="h-10 w-full rounded-t-xl pl-9 pr-3 text-sm outline-none" />
              </div>
              <ul className="max-h-56 overflow-y-auto">
                {filtered.map((b) => {
                  const on = picked.includes(b.id);
                  return (
                    <li key={b.id}>
                      <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                        <input type="checkbox" checked={on} onChange={() => setPicked((p) => (on ? p.filter((x) => x !== b.id) : [...p, b.id]))} className="h-4 w-4 rounded border-slate-300" />
                        <span className="min-w-0 flex-1 truncate">{b.title}</span>
                        <span className="shrink-0 text-xs text-slate-500">{formatRupiah(b.effective_price ?? b.price)}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Harga paket"
              hint={
                individual > 0 ? (
                  <>
                    Harga satuan {formatRupiah(individual)}
                    {price > 0 && (price < individual ? ` · hemat ${savingsPct}%` : ' · harus lebih murah!')}
                  </>
                ) : (
                  'Pilih buku dulu'
                )
              }
            >
              <Input type="number" min={1000} step={500} value={form.price} onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))} required />
            </Field>
            <Field label="Status">
              <label className="flex h-10 items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
                Aktif (tampil di toko)
              </label>
            </Field>
            <Field label="Mulai (opsional)">
              <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
            </Field>
            <Field label="Berakhir (opsional)" hint="Kosongkan bila paket berlaku terus">
              <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={saving} disabled={picked.length < 2 || price <= 0}>
              Simpan paket
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
