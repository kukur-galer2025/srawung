'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog } from '@/lib/dialog';
import { AdminHeader, Button, Input, Notice, Panel, Table, td, th } from '@/components/admin/ui';

interface Category {
  id: number;
  name: string;
  slug: string;
  books_count: number;
}

export default function AdminCategoriesPage() {
  const { data, isLoading, mutate } = useSWR<Category[]>('/admin/categories', (url: string) => api.get(url));
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [notice, setNotice] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: 'success', text: ok });
      await mutate();
      return true;
    } catch (err: unknown) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Terjadi kesalahan.' });
      return false;
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    if (await run(() => api.post('/admin/categories', { name: name.trim() }), `Kategori "${name.trim()}" ditambahkan.`)) setName('');
    setAdding(false);
  };

  const save = async (c: Category) => {
    if (!editName.trim() || editName.trim() === c.name) return setEditId(null);
    if (await run(() => api.put(`/admin/categories/${c.id}`, { name: editName.trim() }), 'Kategori diperbarui.')) setEditId(null);
  };

  const remove = async (c: Category) => {
    const ok = await confirmDialog({
      title: `Hapus kategori "${c.name}"?`,
      text: c.books_count > 0 ? `${c.books_count} buku di kategori ini akan menjadi tanpa kategori.` : 'Kategori ini belum dipakai buku apa pun.',
      confirmText: 'Hapus kategori',
      tone: 'danger',
    });
    if (!ok) return;
    run(() => api.delete(`/admin/categories/${c.id}`), `Kategori "${c.name}" dihapus.`);
  };

  const rows = Array.isArray(data) ? data : [];

  return (
    <>
      <AdminHeader title="Kategori" description="Kelompokkan buku agar mudah ditemukan pembeli." />

      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <Panel className="mb-6 p-4">
        <form onSubmit={add} className="flex flex-col gap-3 sm:flex-row">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama kategori baru, mis. Sejarah" maxLength={255} />
          <Button type="submit" loading={adding} disabled={!name.trim()} className="shrink-0">
            <Plus className="h-4 w-4" />
            Tambah
          </Button>
        </form>
      </Panel>

      <Panel className="overflow-hidden">
        <Table
          colSpan={4}
          loading={isLoading}
          empty={!rows.length}
          head={
            <tr>
              <th className={th}>Nama</th>
              <th className={th}>Slug</th>
              <th className={th}>Jumlah buku</th>
              <th className={th}></th>
            </tr>
          }
        >
          {rows.map((c) => (
            <tr key={c.id} className="hover:bg-slate-50/60">
              <td className={td}>
                {editId === c.id ? (
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') save(c);
                      if (e.key === 'Escape') setEditId(null);
                    }}
                    className="h-9"
                  />
                ) : (
                  <span className="font-semibold text-slate-900">{c.name}</span>
                )}
              </td>
              <td className={`${td} font-mono text-xs text-slate-500`}>{c.slug}</td>
              <td className={`${td} tabular-nums text-slate-600`}>{c.books_count}</td>
              <td className={`${td} text-right`}>
                <div className="flex justify-end gap-1">
                  {editId === c.id ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => save(c)} aria-label="Simpan">
                        <Check className="h-4 w-4 text-emerald-600" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditId(null)} aria-label="Batal">
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditId(c.id);
                          setEditName(c.name);
                        }}
                        aria-label={`Ubah ${c.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(c)} aria-label={`Hapus ${c.name}`} className="hover:bg-rose-50 hover:text-rose-600">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
