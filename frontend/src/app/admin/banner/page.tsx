'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import useSWR from 'swr';
import { ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { confirmDialog } from '@/lib/dialog';
import { formatDateTime } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { Modal } from '@/components/Modal';
import { BannerCarousel, BANNER_THEMES } from '@/components/store/BannerCarousel';

interface AdminBanner {
  id: number;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  cta_label: string | null;
  link_url: string | null;
  image_url: string | null;
  theme: string;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

const THEME_LABELS: Record<string, string> = {
  navy: 'Navy',
  blue: 'Biru',
  amber: 'Oranye',
  emerald: 'Hijau',
  rose: 'Merah muda',
  violet: 'Ungu',
};

const EMPTY = {
  eyebrow: '',
  title: '',
  subtitle: '',
  cta_label: 'Lihat selengkapnya',
  link_url: '',
  theme: 'navy',
  sort_order: '0',
  is_active: true,
  starts_at: '',
  ends_at: '',
};

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function bannerState(b: AdminBanner): { label: string; variant: 'success' | 'info' | 'default' | 'warning' } {
  const now = Date.now();
  if (!b.is_active) return { label: 'Nonaktif', variant: 'default' };
  if (b.starts_at && new Date(b.starts_at).getTime() > now) return { label: 'Terjadwal', variant: 'info' };
  if (b.ends_at && new Date(b.ends_at).getTime() <= now) return { label: 'Selesai', variant: 'warning' };
  return { label: 'Tayang', variant: 'success' };
}

export default function AdminBannersPage() {
  const { data, isLoading, mutate } = useSWR<AdminBanner[]>('/admin/banners', (url: string) => api.get(url));
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBanner | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [image, setImage] = useState<File | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const rows = Array.isArray(data) ? data : [];
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const imagePreview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  const previewBanner = {
    id: -1,
    eyebrow: form.eyebrow || null,
    title: form.title || 'Judul banner Anda',
    subtitle: form.subtitle || null,
    cta_label: form.cta_label || null,
    link_url: form.link_url || '#',
    image_url: imagePreview ?? (removeImage ? null : editing?.image_url ?? null),
    theme: form.theme,
  };

  const openForm = (b?: AdminBanner) => {
    setEditing(b ?? null);
    setForm(
      b
        ? {
            eyebrow: b.eyebrow ?? '',
            title: b.title,
            subtitle: b.subtitle ?? '',
            cta_label: b.cta_label ?? '',
            link_url: b.link_url ?? '',
            theme: b.theme,
            sort_order: String(b.sort_order ?? 0),
            is_active: b.is_active,
            starts_at: toLocalInput(b.starts_at),
            ends_at: toLocalInput(b.ends_at),
          }
        : { ...EMPTY, sort_order: String(rows.length + 1) }
    );
    setImage(null);
    setRemoveImage(false);
    setError(null);
    setOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (k === 'is_active') return fd.append(k, v ? '1' : '0');
      if (v === '') return;
      fd.append(k, k === 'starts_at' || k === 'ends_at' ? new Date(String(v)).toISOString() : String(v));
    });
    if (image) fd.append('image', image);
    if (removeImage) fd.append('remove_image', '1');
    try {
      if (editing) {
        fd.append('_method', 'PUT');
        await api.post(`/admin/banners/${editing.id}`, fd);
      } else {
        await api.post('/admin/banners', fd);
      }
      setOpen(false);
      setNotice(editing ? 'Banner diperbarui.' : 'Banner dibuat dan langsung tayang di beranda.');
      await mutate();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan banner.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (b: AdminBanner) => {
    const ok = await confirmDialog({ title: 'Hapus banner ini?', text: `"${b.title}" tidak akan tampil lagi di beranda.`, confirmText: 'Hapus', tone: 'danger' });
    if (!ok) return;
    try {
      await api.delete(`/admin/banners/${b.id}`);
      setNotice('Banner dihapus.');
      await mutate();
    } catch (err: unknown) {
      setNotice(err instanceof Error ? err.message : 'Gagal menghapus banner.');
    }
  };

  return (
    <>
      <AdminHeader
        title="Banner iklan"
        description="Slide promo di bagian atas beranda. Urutan kecil tampil lebih dulu."
        actions={
          <Button onClick={() => openForm()}>
            <Plus className="h-4 w-4" />
            Buat banner
          </Button>
        }
      />

      {notice && (
        <Notice tone="success" onClose={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      {isLoading ? (
        <Panel className="p-10 text-center text-sm text-slate-400">Memuat…</Panel>
      ) : rows.length === 0 ? (
        <Panel className="p-10 text-center">
          <p className="font-semibold text-slate-900">Belum ada banner</p>
          <p className="mt-1 text-sm text-slate-500">Beranda akan menampilkan banner bawaan sampai Anda membuat banner sendiri.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((b) => {
            const st = bannerState(b);
            const t = BANNER_THEMES[b.theme] ?? BANNER_THEMES.blue;
            return (
              <Panel key={b.id} className="overflow-hidden">
                <div className={`relative flex h-36 items-center gap-4 overflow-hidden bg-linear-to-br p-5 text-white ${t.bg}`}>
                  <div className="min-w-0 flex-1">
                    {b.eyebrow && <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/80">{b.eyebrow}</p>}
                    <p className="line-clamp-2 font-display text-lg font-semibold leading-tight">{b.title}</p>
                    {b.subtitle && <p className="mt-1 line-clamp-1 text-xs text-white/75">{b.subtitle}</p>}
                  </div>
                  {b.image_url && (
                    <span className="relative aspect-[3/4.3] h-28 shrink-0 rotate-3 overflow-hidden rounded-md shadow-lg ring-1 ring-white/20">
                      <Image src={b.image_url} alt="" fill sizes="80px" className="object-cover" unoptimized />
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 text-xs text-slate-500">
                    <div className="mb-1 flex items-center gap-2">
                      <Badge variant={st.variant} dot>
                        {st.label}
                      </Badge>
                      <span>Urutan {b.sort_order}</span>
                    </div>
                    <p className="truncate">
                      {b.link_url ? `→ ${b.link_url}` : 'Tanpa tautan'}
                      {b.ends_at && ` · s.d. ${formatDateTime(b.ends_at)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openForm(b)} aria-label="Ubah banner">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(b)} aria-label="Hapus banner" className="hover:bg-rose-50 hover:text-rose-600">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      <Modal isOpen={open} onClose={() => setOpen(false)} title={editing ? 'Ubah banner' : 'Buat banner'} maxWidth="3xl">
        <form onSubmit={submit} className="space-y-5">
          {error && <Notice tone="error">{error}</Notice>}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Pratinjau</p>
            <div className="pointer-events-none origin-top-left">
              <BannerCarousel banners={[previewBanner]} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label kecil" hint="mis. PROMO PEKAN INI (opsional)">
              <Input maxLength={40} value={form.eyebrow} onChange={set('eyebrow')} />
            </Field>
            <Field label="Judul">
              <Input required maxLength={120} value={form.title} onChange={set('title')} />
            </Field>
          </div>
          <Field label="Subjudul" hint="Satu kalimat penjelas (opsional)">
            <Input maxLength={255} value={form.subtitle} onChange={set('subtitle')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Teks tombol">
              <Input maxLength={40} value={form.cta_label} onChange={set('cta_label')} />
            </Field>
            <Field label="Tautan tombol" hint='Halaman Srawung (mis. "/promo") atau URL "https://…"'>
              <Input maxLength={255} value={form.link_url} onChange={set('link_url')} placeholder="/promo" />
            </Field>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Warna latar</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(BANNER_THEMES).map(([key, t]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, theme: key }))}
                  aria-pressed={form.theme === key}
                  className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${
                    form.theme === key ? 'border-blue-600 ring-2 ring-blue-600/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className={`h-6 w-6 rounded-full bg-linear-to-br ${t.bg}`} />
                  {THEME_LABELS[key] ?? key}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">Gambar di sisi kanan (opsional)</span>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex h-10 max-w-full cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <ImagePlus className="h-4 w-4 shrink-0" />
                <span className="truncate">{image ? image.name : 'Pilih gambar · maks 20 MB'}</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    setImage(e.target.files?.[0] ?? null);
                    setRemoveImage(false);
                  }}
                />
              </label>
              {(image || (editing?.image_url && !removeImage)) && (
                <button
                  type="button"
                  onClick={() => {
                    setImage(null);
                    setRemoveImage(true);
                  }}
                  className="text-sm font-medium text-rose-600 hover:underline"
                >
                  Hapus gambar
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">Tips: pakai sampul buku (rasio 3:4) agar tampil seperti contoh.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Mulai tayang" hint="Kosong = langsung">
              <Input type="datetime-local" value={form.starts_at} onChange={set('starts_at')} />
            </Field>
            <Field label="Selesai tayang" hint="Kosong = tanpa batas">
              <Input type="datetime-local" value={form.ends_at} onChange={set('ends_at')} />
            </Field>
            <Field label="Urutan">
              <Input type="number" min={0} max={999} value={form.sort_order} onChange={set('sort_order')} />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-3">
            <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} className="h-4 w-4 accent-blue-700" />
            <span className="text-sm font-semibold text-slate-800">Aktif (tampilkan di beranda)</span>
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? 'Simpan' : 'Buat banner'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
