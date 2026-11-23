'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ExternalLink, ImagePlus, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog, toast } from '@/lib/dialog';
import { formatDateTime } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, SearchInput, Select, Table, Tabs, Textarea, td, th } from '@/components/admin/ui';
import { RichTextEditor } from '@/components/admin/RichTextEditor';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';
import type { BookSummary, Paginated } from '@/lib/types';

interface AdminPost {
  id: number;
  title: string;
  slug: string;
  tag: string | null;
  excerpt: string | null;
  body: string;
  format?: 'markdown' | 'html';
  cover_url: string | null;
  cover_source?: 'upload' | 'body' | 'book' | null;
  book_cover_url?: string | null;
  book_id: number | null;
  book?: { id: number; title: string } | null;
  status: 'draft' | 'published';
  published_at: string | null;
  views: number;
  reading_minutes: number;
}

const EMPTY = { title: '', tag: '', excerpt: '', body: '', book_id: '', status: 'published' as 'draft' | 'published', published_at: '' };


function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function postState(p: AdminPost): { label: string; variant: 'success' | 'info' | 'default' } {
  if (p.status === 'draft') return { label: 'Draf', variant: 'default' };
  if (p.published_at && new Date(p.published_at).getTime() > Date.now()) return { label: 'Terjadwal', variant: 'info' };
  return { label: 'Terbit', variant: 'success' };
}

export default function AdminBlogPage() {
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminPost | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [cover, setCover] = useState<File | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [editorKey, setEditorKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page) });
  if (status !== 'all') qs.set('status', status);
  if (debounced) qs.set('search', debounced);
  const { data, isLoading, mutate } = useSWR<Paginated<AdminPost>>(`/admin/posts?${qs}`, (url: string) => api.get(url));
  const { data: booksData } = useSWR<Paginated<BookSummary>>('/books?per_page=48&sort=terbaru', (url: string) => api.get(url));
  const { data: tagData } = useSWR<{ tags: string[] }>('/posts?per_page=1', (url: string) => api.get(url));
  const rows = data?.data ?? [];

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const openForm = async (p?: AdminPost) => {
    setEditing(p ?? null);
    setForm(
      p
        ? {
            title: p.title,
            tag: p.tag ?? '',
            excerpt: p.excerpt ?? '',
            body: p.format === 'html' ? p.body : '',
            book_id: p.book_id ? String(p.book_id) : '',
            status: p.status,
            published_at: toLocalInput(p.published_at),
          }
        : EMPTY
    );
    setCover(null);
    setRemoveCover(false);
    setError(null);
    setEditorKey((k) => k + 1);
    setOpen(true);

    // Artikel lama (Markdown) dikonversi sekali ke HTML agar bisa diedit secara visual.
    if (p && p.format !== 'html') {
      setBodyLoading(true);
      try {
        const res = await api.post('/admin/posts/preview', { body: p.body, format: 'markdown' });
        setForm((f) => ({ ...f, body: res.html ?? '' }));
        setEditorKey((k) => k + 1);
      } catch {
        setError('Isi artikel gagal dimuat ke editor. Tutup lalu coba lagi.');
      } finally {
        setBodyLoading(false);
      }
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData();
    if (!form.body.trim()) {
      setSaving(false);
      return setError('Isi artikel masih kosong.');
    }
    Object.entries(form).forEach(([k, v]) => {
      if (v === '') return;
      fd.append(k, k === 'published_at' ? new Date(v).toISOString() : v);
    });
    fd.append('format', 'html');
    if (cover) fd.append('cover', cover);
    if (removeCover) fd.append('remove_cover', '1');
    try {
      if (editing) {
        fd.append('_method', 'PUT');
        await api.post(`/admin/posts/${editing.id}`, fd);
      } else {
        await api.post('/admin/posts', fd);
      }
      setOpen(false);
      setNotice(editing ? 'Artikel diperbarui.' : form.status === 'published' ? 'Artikel diterbitkan.' : 'Draf artikel disimpan.');
      await mutate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan artikel.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (p: AdminPost) => {
    const ok = await confirmDialog({ title: 'Hapus artikel ini?', text: `"${p.title}" akan dihapus permanen.`, confirmText: 'Hapus', tone: 'danger' });
    if (!ok) return;
    try {
      await api.delete(`/admin/posts/${p.id}`);
      setNotice('Artikel dihapus.');
      await mutate();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus artikel.');
    }
  };

  return (
    <>
      <AdminHeader
        title="Blog"
        description="Artikel & tips untuk menarik pembaca dari Google dan media sosial."
        actions={
          <Button onClick={() => openForm()}>
            <Plus className="h-4 w-4" />
            Tulis artikel
          </Button>
        }
      />

      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          items={[
            { id: 'all', label: 'Semua' },
            { id: 'published', label: 'Terbit' },
            { id: 'draft', label: 'Draf' },
          ]}
        />
        <SearchInput value={search} onChange={setSearch} placeholder="Cari judul artikel…" />
      </div>

      <Panel className="overflow-hidden">
        <Table
          colSpan={5}
          loading={isLoading}
          empty={!rows.length}
          head={
            <tr>
              <th className={th}>Artikel</th>
              <th className={th}>Status</th>
              <th className={th}>Tanggal terbit</th>
              <th className={`${th} text-right`}>Dibaca</th>
              <th className={th}></th>
            </tr>
          }
        >
          {rows.map((p) => {
            const st = postState(p);
            return (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className={td}>
                  <p className="line-clamp-1 font-semibold text-slate-900">{p.title}</p>
                  <p className="text-xs text-slate-500">
                    {p.tag ?? 'Tanpa tag'} · {p.reading_minutes} mnt baca{p.book ? ` · ${p.book.title}` : ''}
                  </p>
                </td>
                <td className={td}>
                  <Badge variant={st.variant} dot>
                    {st.label}
                  </Badge>
                </td>
                <td className={`${td} text-slate-600`}>{p.published_at ? formatDateTime(p.published_at) : '—'}</td>
                <td className={`${td} text-right tabular-nums text-slate-900`}>{p.views.toLocaleString('id-ID')}</td>
                <td className={`${td} text-right`}>
                  <div className="flex justify-end gap-1">
                    {st.label === 'Terbit' && (
                      <Link
                        href={`/blog/${p.slug}`}
                        target="_blank"
                        aria-label="Lihat artikel"
                        className="inline-flex h-8 items-center rounded-xl px-3 text-slate-600 hover:bg-slate-100"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => openForm(p)} aria-label={`Ubah ${p.title}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p)} aria-label={`Hapus ${p.title}`} className="hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </Table>
      </Panel>

      <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Ubah artikel' : 'Tulis artikel'} maxWidth="3xl">
        <form onSubmit={submit} className="space-y-4">
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Judul">
            <Input required maxLength={200} value={form.title} onChange={set('title')} placeholder="mis. 5 Cara Belajar Laravel dengan Cepat" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tag / rubrik" hint="Pilih yang ada atau ketik baru">
              <Input list="post-tags" maxLength={40} value={form.tag} onChange={set('tag')} placeholder="Tips Belajar" />
              <datalist id="post-tags">
                {(tagData?.tags ?? []).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Buku yang direkomendasikan" hint="Tampil di samping artikel">
              <Select value={form.book_id} onChange={set('book_id')}>
                <option value="">Tidak ada</option>
                {(booksData?.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Ringkasan" hint="1–2 kalimat. Tampil di kartu artikel & hasil pencarian Google.">
            <Textarea rows={2} maxLength={400} value={form.excerpt} onChange={set('excerpt')} />
          </Field>

          <CoverPicker
            file={cover}
            currentUrl={removeCover ? null : (editing?.cover_source === 'upload' ? editing.cover_url : null)}
            autoUrl={editing && editing.cover_source !== 'upload' ? (editing.cover_url ?? editing.book_cover_url ?? null) : null}
            autoLabel={editing?.cover_source === 'body' ? 'gambar pertama di isi artikel' : editing?.cover_source === 'book' ? 'sampul buku terkait' : null}
            onPick={(f) => {
              setCover(f);
              setRemoveCover(false);
            }}
            onRemove={() => {
              setCover(null);
              setRemoveCover(true);
            }}
          />

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Isi artikel</span>
            {bodyLoading ? (
              <div className="flex h-[26rem] items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Memuat isi artikel…
              </div>
            ) : (
              <RichTextEditor key={editorKey} value={form.body} onChange={(html) => setForm((f) => ({ ...f, body: html }))} />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Status">
              <Select value={form.status} onChange={set('status')}>
                <option value="published">Terbitkan</option>
                <option value="draft">Simpan sebagai draf</option>
              </Select>
            </Field>
            <Field label="Tanggal terbit" hint="Kosong = sekarang. Isi tanggal mendatang untuk menjadwalkan.">
              <Input type="datetime-local" value={form.published_at} onChange={set('published_at')} disabled={form.status === 'draft'} />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Simpan' : form.status === 'published' ? 'Terbitkan' : 'Simpan draf'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

/** Foto sampul artikel: pratinjau besar + tarik-lepas. */
function CoverPicker({
  file,
  currentUrl,
  autoUrl,
  autoLabel,
  onPick,
  onRemove,
}: {
  file: File | null;
  currentUrl: string | null;
  autoUrl: string | null;
  autoLabel: string | null;
  onPick: (f: File) => void;
  onRemove: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const shown = preview ?? currentUrl;
  const accept = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast.error('Foto sampul harus JPG, PNG, atau WebP.');
    if (f.size > 20 * 1024 * 1024) return toast.error('Ukuran foto sampul maksimal 20 MB.');
    onPick(f);
  };

  return (
    <div>
      <span className="mb-1.5 block text-sm font-semibold text-slate-700">Foto sampul</span>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          accept(e.dataTransfer.files?.[0]);
        }}
        className={`group relative flex aspect-[2/1] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${
          dragging ? 'border-blue-600 bg-blue-50' : shown ? 'border-transparent' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40'
        }`}
      >
        {shown ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={shown} alt="Pratinjau sampul" className="absolute inset-0 h-full w-full object-cover" />
            <span className="absolute inset-0 flex items-center justify-center bg-slate-950/0 text-sm font-semibold text-white opacity-0 transition group-hover:bg-slate-950/45 group-hover:opacity-100">
              <ImagePlus className="mr-2 h-4 w-4" />
              Ganti foto
            </span>
          </>
        ) : autoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={autoUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40 blur-[1px]" />
            <span className="relative rounded-xl bg-white/90 px-4 py-3 text-center text-sm text-slate-700 shadow">
              <ImagePlus className="mx-auto mb-1 h-5 w-5 text-blue-700" />
              <strong className="block">Unggah foto sampul</strong>
              Saat ini otomatis memakai {autoLabel}
            </span>
          </>
        ) : (
          <span className="text-center text-sm text-slate-500">
            <ImagePlus className="mx-auto mb-2 h-7 w-7 text-slate-400" />
            <strong className="block text-slate-700">Klik atau tarik foto ke sini</strong>
            JPG, PNG, atau WebP · maks. 20 MB · rasio 2:1 (mis. 1600×800)
          </span>
        )}
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => accept(e.target.files?.[0])} />
      </label>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-slate-500">
        <span>Tanpa foto, sampul otomatis memakai gambar pertama di isi artikel, lalu sampul buku terkait.</span>
        {shown && (
          <button type="button" onClick={onRemove} className="shrink-0 font-medium text-rose-600 hover:underline">
            Hapus foto
          </button>
        )}
      </div>
    </div>
  );
}
