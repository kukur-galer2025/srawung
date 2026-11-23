'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog, toast } from '@/lib/dialog';
import { AdminHeader, Button, Field, Input, Notice, Panel, Table, td, th } from '@/components/admin/ui';
import { Modal } from '@/components/Modal';

interface Category {
  id: number;
  name: string;
  slug: string;
  books_count: number;
}

const toSlug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export default function AdminCategoriesPage() {
  const { data, isLoading, error, mutate } = useSWR<Category[]>('/admin/categories', (url: string) => api.get(url));
  const rows = Array.isArray(data) ? data : [];

  // null = tertutup; { id: null } = tambah; { id } = ubah
  const [form, setForm] = useState<{ id: number | null; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openAdd = () => {
    setFormError(null);
    setForm({ id: null, name: '' });
  };
  const openEdit = (c: Category) => {
    setFormError(null);
    setForm({ id: c.id, name: c.name });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const name = form.name.trim();
    setSaving(true);
    setFormError(null);
    try {
      if (form.id) {
        await api.put(`/admin/categories/${form.id}`, { name });
        toast.success('Kategori diperbarui', `Nama kategori menjadi "${name}".`);
      } else {
        await api.post('/admin/categories', { name });
        toast.success('Kategori ditambahkan', `"${name}" sudah bisa dipilih saat menambah buku.`);
      }
      setForm(null);
      await mutate();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Kategori gagal disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (c: Category) => {
    const ok = await confirmDialog({
      title: `Hapus kategori "${c.name}"?`,
      text:
        c.books_count > 0
          ? `${c.books_count} buku di kategori ini tidak dihapus, tetapi menjadi tanpa kategori. Anda bisa memindahkannya ke kategori lain lewat menu Buku.`
          : 'Kategori ini belum dipakai buku apa pun.',
      confirmText: 'Hapus kategori',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/categories/${c.id}`);
      toast.success('Kategori dihapus', `"${c.name}" sudah dihapus.`);
      await mutate();
    } catch (err: unknown) {
      toast.error('Kategori gagal dihapus', err instanceof Error ? err.message : undefined);
    }
  };

  const editing = form?.id ? rows.find((c) => c.id === form.id) : null;

  return (
    <>
      <AdminHeader
        title="Kategori"
        description="Kelompokkan buku agar mudah ditemukan pembeli. Kategori tampil di katalog dan dipilih saat menambah buku."
        actions={
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Tambah kategori
          </Button>
        }
      />

      {error && <Notice tone="error">Daftar kategori gagal dimuat: {error instanceof Error ? error.message : 'coba muat ulang halaman.'}</Notice>}

      <Panel className="overflow-hidden">
        {!isLoading && !rows.length ? (
          <div className="px-6 py-14 text-center">
            <Tags className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-medium text-slate-900">Belum ada kategori</p>
            <p className="mt-1 text-sm text-slate-500">Contoh: Pemrograman, Desain, Persiapan Ujian.</p>
            <Button className="mt-5" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Tambah kategori pertama
            </Button>
          </div>
        ) : (
          <Table
            colSpan={4}
            loading={isLoading}
            empty={!rows.length}
            head={
              <tr>
                <th className={th}>Nama</th>
                <th className={th}>Alamat di katalog</th>
                <th className={th}>Jumlah buku</th>
                <th className={th}></th>
              </tr>
            }
          >
            {rows.map((c) => (
              <tr key={c.id}>
                <td className={`${td} font-medium text-slate-900`}>{c.name}</td>
                <td className={`${td} text-[13px] text-slate-500`}>
                  <Link href={`/buku?kategori=${c.slug}`} target="_blank" className="hover:text-slate-900 hover:underline">
                    /buku?kategori={c.slug}
                  </Link>
                </td>
                <td className={`${td} tabular-nums text-slate-600`}>{c.books_count} buku</td>
                <td className={td}>
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(c)} aria-label={`Ubah ${c.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                      Ubah
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => remove(c)} aria-label={`Hapus ${c.name}`} className="hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Modal isOpen={!!form} onClose={() => setForm(null)} title={form?.id ? 'Ubah kategori' : 'Tambah kategori'} maxWidth="md">
        {form && (
          <form onSubmit={save} className="space-y-5">
            {formError && (
              <p role="alert" className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
                {formError}
              </p>
            )}
            <Field
              label="Nama kategori"
              hint={form.name.trim() ? `Alamat di katalog: /buku?kategori=${toSlug(form.name.trim()) || '…'}` : 'Mis. Sejarah, Bisnis & Keuangan, Novel'}
            >
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={255} autoFocus placeholder="Nama kategori" />
            </Field>
            {editing && editing.books_count > 0 && (
              <p className="rounded-lg bg-slate-50 px-3.5 py-2.5 text-[13px] text-slate-600">
                {editing.books_count} buku di kategori ini ikut memakai nama baru.
              </p>
            )}
            <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
              <Button type="button" variant="secondary" onClick={() => setForm(null)}>
                Batal
              </Button>
              <Button type="submit" loading={saving}>
                {form.id ? 'Simpan' : 'Tambah kategori'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}
