'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { BookOpen, Check, Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog } from '@/lib/dialog';
import { formatDate, formatRupiah } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, Select, Table, td, th } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';

interface Coupon {
  id: number;
  code: string;
  type: 'fixed' | 'percent';
  value: number;
  quota: number | null;
  used_count: number;
  expires_at: string | null;
  is_public?: boolean;
  creator?: { creator_profile?: { display_name: string } | null; name: string } | null;
  description?: string | null;
  orders_count?: number;
  restrict_books?: boolean;
  books?: { id: number; title: string }[];
}

interface OwnBook {
  id: number;
  title: string;
  status: string;
}

const EMPTY = { code: '', type: 'percent' as 'percent' | 'fixed', value: '', quota: '', expires_at: '', is_public: false, description: '', restrict_books: false, book_ids: [] as number[] };

function couponState(c: Coupon): { label: string; variant: 'success' | 'warning' | 'default' } {
  if (c.expires_at && new Date(c.expires_at) < new Date()) return { label: 'Kedaluwarsa', variant: 'default' };
  if (c.quota !== null && c.used_count >= c.quota) return { label: 'Kuota habis', variant: 'warning' };
  return { label: 'Aktif', variant: 'success' };
}

/** Kupon Srawung (admin, berlaku semua buku) atau voucher kreator (hanya buku kreator tsb.). */
export function CouponManager({ mode = 'admin' }: { mode?: 'admin' | 'creator' }) {
  const base = mode === 'admin' ? '/admin/coupons' : '/creator/coupons';
  const { data, isLoading, mutate } = useSWR<Coupon[]>(base, (url: string) => api.get(url));
  // Kreator hanya bisa memilih bukunya sendiri (server juga menolak buku milik orang lain).
  const { data: ownBooksPage } = useSWR<{ data: OwnBook[] }>(mode === 'creator' ? '/creator/books?per_page=100' : null, (url: string) => api.get(url));
  const ownBooks = ownBooksPage?.data ?? [];
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = Array.isArray(data) ? data : [];
  const toggleBook = (id: number) =>
    setForm((f) => ({ ...f, book_ids: f.book_ids.includes(id) ? f.book_ids.filter((b) => b !== id) : [...f.book_ids, id] }));
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openForm = (c?: Coupon) => {
    setEditing(c ?? null);
    setForm(
      c
        ? {
            code: c.code,
            type: c.type,
            value: String(c.value),
            quota: c.quota ? String(c.quota) : '',
            expires_at: c.expires_at ? c.expires_at.slice(0, 10) : '',
            is_public: !!c.is_public,
            description: c.description ?? '',
            restrict_books: !!c.restrict_books,
            book_ids: (c.books ?? []).map((b) => b.id),
          }
        : EMPTY
    );
    setError(null);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.type === 'percent' && Number(form.value) > 100) return setError('Diskon persen maksimal 100.');
    if (mode === 'creator' && form.restrict_books && !form.book_ids.length) return setError('Pilih minimal satu buku untuk voucher ini.');
    setSaving(true);
    setError(null);
    const payload = {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value: Number(form.value),
      quota: form.quota ? Number(form.quota) : null,
      expires_at: form.expires_at ? `${form.expires_at} 23:59:59` : null,
      is_public: form.is_public,
      description: form.description.trim() || null,
      ...(mode === 'creator' ? { restrict_books: form.restrict_books, book_ids: form.restrict_books ? form.book_ids : [] } : {}),
    };
    try {
      if (editing) await api.put(`${base}/${editing.id}`, payload);
      else await api.post(base, payload);
      setOpen(false);
      setNotice(editing ? 'Kupon diperbarui.' : `Kupon ${payload.code} dibuat.`);
      await mutate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan kupon.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Coupon) => {
    const ok = await confirmDialog({
      title: `Hapus kupon ${c.code}?`,
      text: 'Pembeli tidak bisa lagi memakai kode ini. Pesanan yang sudah memakainya tidak terpengaruh.',
      confirmText: 'Hapus kupon',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`${base}/${c.id}`);
      setNotice(`Kupon ${c.code} dihapus.`);
      await mutate();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus kupon.');
    }
  };

  return (
    <>
      <AdminHeader
        title={mode === 'admin' ? 'Kupon' : 'Voucher'}
        description={
          mode === 'admin'
            ? 'Kupon Srawung berlaku untuk semua buku dan diskonnya ditanggung Srawung. Voucher buatan kreator ditandai nama kreatornya.'
            : 'Voucher hanya memotong harga buku-buku Anda. Diskon mengurangi pendapatan Anda dari penjualan itu, bukan komisi Srawung. Bagikan kodenya di media sosial Anda.'
        }
        actions={
          <Button onClick={() => openForm()}>
            <Plus className="h-4 w-4" />
            {mode === 'admin' ? 'Buat kupon' : 'Buat voucher'}
          </Button>
        }
      />

      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      <Panel className="overflow-hidden">
        <Table
          colSpan={6}
          loading={isLoading}
          empty={!rows.length}
          head={
            <tr>
              <th className={th}>Kode</th>
              <th className={th}>Diskon</th>
              <th className={th}>Pemakaian</th>
              <th className={th}>Berlaku sampai</th>
              <th className={th}>Status</th>
              <th className={th}></th>
            </tr>
          }
        >
          {rows.map((c) => {
            const st = couponState(c);
            return (
              <tr key={c.id} className="hover:bg-slate-50/60">
                <td className={td}>
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-sm font-semibold text-slate-900">{c.code}</span>
                  {c.is_public && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">Publik</span>}
                  {mode === 'creator' && (
                    <span className="mt-1.5 block text-xs text-slate-500" title={c.books?.map((b) => b.title).join(', ')}>
                      {c.restrict_books ? `Berlaku untuk ${c.books?.length ?? 0} buku pilihan` : 'Berlaku untuk semua buku Anda'}
                    </span>
                  )}
                  {mode === 'admin' && c.creator && (
                    <span className="ml-2 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                      Kreator · {c.creator.creator_profile?.display_name ?? c.creator.name}
                    </span>
                  )}
                </td>
                <td className={`${td} font-semibold text-slate-900`}>{c.type === 'percent' ? `${c.value}%` : formatRupiah(c.value)}</td>
                <td className={td}>
                  <span className="tabular-nums text-slate-900">{c.used_count}</span>
                  <span className="text-slate-400"> / {c.quota ?? '∞'}</span>
                  {c.quota ? (
                    <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, (c.used_count / c.quota) * 100)}%` }} />
                    </div>
                  ) : null}
                </td>
                <td className={`${td} text-slate-600`}>{c.expires_at ? formatDate(c.expires_at) : 'Tanpa batas'}</td>
                <td className={td}>
                  <Badge variant={st.variant} dot>
                    {st.label}
                  </Badge>
                </td>
                <td className={`${td} text-right`}>
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openForm(c)} aria-label={`Ubah ${c.code}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(c)} aria-label={`Hapus ${c.code}`} className="hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>

      <Modal isOpen={open} onClose={() => setOpen(false)} title={mode === 'creator' ? (editing ? 'Ubah voucher' : 'Buat voucher') : editing ? 'Ubah kupon' : 'Buat kupon'}>
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          <Field label={mode === 'creator' ? 'Kode voucher' : 'Kode kupon'} hint="Huruf besar & angka, tanpa spasi">
            <Input
              required
              maxLength={50}
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/\s/g, '') }))}
              placeholder="HEMAT20"
              className="font-mono uppercase"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Jenis">
              <Select value={form.type} onChange={set('type')}>
                <option value="percent">Persen (%)</option>
                <option value="fixed">Nominal (Rp)</option>
              </Select>
            </Field>
            <Field label={form.type === 'percent' ? 'Diskon (%)' : 'Diskon (Rp)'}>
              <Input required type="number" min={1} max={form.type === 'percent' ? (mode === 'admin' ? 100 : 90) : undefined} value={form.value} onChange={set('value')} />
            </Field>
            <Field label="Kuota" hint="Kosongkan = tanpa batas">
              <Input type="number" min={1} value={form.quota} onChange={set('quota')} />
            </Field>
            <Field label="Berlaku sampai" hint="Kosongkan = tanpa batas">
              <Input type="date" value={form.expires_at} onChange={set('expires_at')} />
            </Field>
          </div>
          {mode === 'creator' && (
            <fieldset className="space-y-2.5">
              <legend className="mb-1.5 text-sm font-semibold text-slate-700">Berlaku untuk</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  { v: false, icon: Layers, title: 'Semua buku saya', desc: 'Termasuk buku yang terbit nanti' },
                  { v: true, icon: BookOpen, title: 'Buku tertentu', desc: 'Pilih judul yang didiskon' },
                ].map((o) => {
                  const active = form.restrict_books === o.v;
                  return (
                    <button
                      key={o.title}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, restrict_books: o.v }))}
                      aria-pressed={active}
                      className={`flex items-start gap-3 rounded-xl p-3 text-left transition ${active ? 'bg-blue-50/70 ring-2 ring-blue-600' : 'ring-1 ring-slate-200 hover:ring-slate-300'}`}
                    >
                      <o.icon className={`mt-0.5 h-4 w-4 shrink-0 ${active ? 'text-blue-700' : 'text-slate-400'}`} />
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{o.title}</span>
                        <span className="block text-xs text-slate-500">{o.desc}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              {form.restrict_books && (
                <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200">
                  {ownBooks.length === 0 ? (
                    <p className="p-4 text-sm text-slate-500">Anda belum punya buku. Tambahkan buku dulu di menu Buku saya.</p>
                  ) : (
                    ownBooks.map((b) => {
                      const on = form.book_ids.includes(b.id);
                      return (
                        <label key={b.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3.5 py-2.5 last:border-0 hover:bg-slate-50">
                          <input type="checkbox" checked={on} onChange={() => toggleBook(b.id)} className="sr-only" />
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 transition ${on ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white ring-slate-300'}`}>
                            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{b.title}</span>
                          {b.status !== 'published' && <span className="shrink-0 text-[11px] font-medium text-slate-400">Draf</span>}
                        </label>
                      );
                    })
                  )}
                </div>
              )}
              {form.restrict_books && ownBooks.length > 0 && <p className="text-xs text-slate-500">{form.book_ids.length} buku dipilih. Buku Srawung & kreator lain tidak pernah ikut terdiskon.</p>}
            </fieldset>
          )}
          {mode === 'creator' && (
            <Field label="Catatan (opsional)" hint="Untuk Anda sendiri, mis. “Promo peluncuran novel”.">
              <Input maxLength={160} value={form.description} onChange={set('description')} />
            </Field>
          )}
          {mode === 'admin' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3.5">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-blue-700"
            />
            <span>
              <span className="block text-sm font-semibold text-slate-800">Tampilkan di halaman Promo & beranda</span>
              <span className="block text-xs text-slate-500">Jika tidak dicentang, kupon hanya bisa dipakai oleh orang yang tahu kodenya.</span>
            </span>
          </label>
          )}
          {mode === 'admin' && form.is_public && (
            <Field label="Deskripsi singkat" hint="Tampil di kartu kupon, maks. 160 karakter">
              <Input maxLength={160} value={form.description} onChange={set('description')} placeholder="Hemat 10% untuk semua buku." />
            </Field>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Simpan' : mode === 'admin' ? 'Buat kupon' : 'Buat voucher'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
