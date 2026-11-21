'use client';

import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, uploadWithProgress } from '@/lib/api';
import { confirmDialog } from '@/lib/dialog';
import { formatRupiah } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, SearchInput, Select, Table, Tabs, Textarea, td, th } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { BookCover, resolveCover } from '@/components/BookCard';
import { Modal } from '@/components/Modal';
import { Pagination } from '@/components/Pagination';

interface Category {
  id: number;
  name: string;
}

interface AdminBook {
  id: number;
  title: string;
  slug: string;
  author: string;
  synopsis: string;
  price: number;
  sale_price?: number | null;
  sale_ends_at?: string | null;
  is_on_sale?: boolean;
  category_id: number | null;
  creator?: { id: number; name: string; creator_profile?: { display_name: string } | null } | null;
  next_book_id?: number | null;
  category?: Category | null;
  total_pages: number | null;
  preview_pages: number | null;
  status: 'draft' | 'published';
  cover_url: string | null;
  source_file_path?: string | null;
  processing_status?: 'pending' | 'processing' | 'done' | 'failed' | null;
  processing_error?: string | null;
  processing_pages_done?: number | null;
  processing_pages_total?: number | null;
  processing_started_at?: string | null;
  processing_finished_at?: string | null;
  updated_at?: string;
}

const isBusy = (b: AdminBook) => b.processing_status === 'pending' || b.processing_status === 'processing';

const EMPTY = {
  title: '',
  author: '',
  synopsis: '',
  price: '',
  sale_price: '',
  sale_ends_at: '',
  category_id: '',
  next_book_id: '',
  total_pages: '',
  preview_pages: '5',
  status: 'published' as 'draft' | 'published',
};

/** ISO (UTC) → nilai input datetime-local di zona waktu perangkat. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Jam yang berdetak tiap detik (untuk perkiraan sisa waktu tanpa memanggil Date.now() saat render). */
function useNow(active: boolean) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [active]);
  return now;
}

const duration = (sec: number) => {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} detik`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m} menit` : `${Math.floor(m / 60)} jam ${m % 60} menit`;
};

function PdfStatus({ book, onRetry, mode }: { book: AdminBook; onRetry: () => void; mode: 'admin' | 'creator' }) {
  const busy = isBusy(book);
  const now = useNow(busy);

  if (book.processing_status === 'pending') {
    const waited = now && book.updated_at ? (now - new Date(book.updated_at).getTime()) / 1000 : 0;
    return (
      <div className="mt-1.5 max-w-[15rem]">
        <p className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          PDF menunggu antrean…
        </p>
        {waited > 120 && (
          <p className="mt-1 text-[11px] leading-snug text-amber-700">
            {mode === 'admin'
              ? 'Sudah lebih dari 2 menit — pastikan queue worker (php artisan queue:work) berjalan.'
              : 'Antrean sedang padat. Anda akan menerima email saat buku selesai diproses.'}
          </p>
        )}
      </div>
    );
  }

  if (book.processing_status === 'processing') {
    const done = book.processing_pages_done ?? 0;
    const total = book.processing_pages_total ?? 0;
    const pct = total ? Math.min(100, Math.floor((done / total) * 100)) : null;
    const elapsed = now && book.processing_started_at ? (now - new Date(book.processing_started_at).getTime()) / 1000 : 0;
    const eta = total && done >= 2 && elapsed > 0 ? ((total - done) * elapsed) / done : null;
    return (
      <div className="mt-1.5 w-full max-w-[15rem]" role="status" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-blue-800">
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {total ? `Halaman ${done.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')}` : `Mengonversi… ${done ? `${done} halaman` : ''}`}
          </span>
          {pct !== null && <span className="tabular-nums">{pct}%</span>}
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-blue-100">
          {pct !== null ? (
            <div className="h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-out" style={{ width: `${Math.max(2, pct)}%` }} />
          ) : (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-400" />
          )}
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          {eta !== null ? `±${duration(eta)} lagi · ` : done >= (total || Infinity) ? 'Menyiapkan pencarian teks… · ' : ''}
          email dikirim saat selesai
        </p>
      </div>
    );
  }

  if (book.processing_status === 'failed') {
    return (
      <div className="mt-1 max-w-xs">
        <p className="flex items-start gap-1.5 text-xs font-medium text-rose-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Konversi PDF gagal: {book.processing_error ?? 'kesalahan tidak diketahui'}</span>
        </p>
        <button onClick={onRetry} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">
          <RefreshCw className="h-3 w-3" />
          Coba lagi
        </button>
      </div>
    );
  }
  if (book.processing_status === 'done') {
    const took =
      book.processing_started_at && book.processing_finished_at
        ? (new Date(book.processing_finished_at).getTime() - new Date(book.processing_started_at).getTime()) / 1000
        : null;
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-700" title={took !== null ? `Diproses dalam ${duration(took)}` : undefined}>
        <CheckCircle2 className="h-3.5 w-3.5" />
        PDF siap dibaca{took !== null ? ` · ${duration(took)}` : ''}
      </p>
    );
  }
  if (!book.source_file_path) {
    return <p className="mt-1 text-xs text-amber-700">Belum ada file PDF</p>;
  }
  return null;
}

/** Kelola buku — dipakai admin (semua buku) dan kreator (hanya bukunya sendiri). */
const fileSize = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GB` : bytes >= 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function BookManager({ mode = 'admin' }: { mode?: 'admin' | 'creator' }) {
  const base = mode === 'admin' ? '/admin/books' : '/creator/books';
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [page, setPage] = useState(1);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminBook | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [cover, setCover] = useState<File | null>(null);
  const [pdf, setPdf] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ label: string; loaded: number; total: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
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
  if (status !== 'all') qs.set('status', status);
  const { data, isLoading, mutate } = useSWR<{ data: AdminBook[]; last_page: number; total: number }>(`${base}?${qs}`, (url: string) => api.get(url), {
    // Selama ada PDF yang sedang dikonversi, perbarui progres tiap 2,5 detik.
    refreshInterval: (latest) => (latest?.data?.some(isBusy) ? 2500 : 0),
  });
  const { data: categories } = useSWR<Category[]>(mode === 'admin' ? '/admin/categories' : '/categories', (url: string) => api.get(url));
  const { data: allBooksPage } = useSWR<{ data: AdminBook[] }>(`${base}?per_page=100`, (url: string) => api.get(url));
  const allBooks = allBooksPage?.data ?? [];
  const books = data?.data ?? [];

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY, category_id: categories?.[0]?.id ? String(categories[0].id) : '' });
    setCover(null);
    setPdf(null);
    setFormError(null);
    setModalOpen(true);
  };

  const openEdit = (b: AdminBook) => {
    setEditing(b);
    setForm({
      title: b.title,
      author: b.author,
      synopsis: b.synopsis ?? '',
      price: String(b.price),
      // Promo yang sudah lewat tidak dibawa ke form (agar bisa disimpan tanpa error tanggal).
      sale_price: b.is_on_sale && b.sale_price ? String(b.sale_price) : '',
      sale_ends_at: b.is_on_sale ? toLocalInput(b.sale_ends_at) : '',
      category_id: b.category_id ? String(b.category_id) : '',
      next_book_id: b.next_book_id ? String(b.next_book_id) : '',
      total_pages: b.total_pages ? String(b.total_pages) : '',
      preview_pages: String(b.preview_pages ?? 5),
      status: b.status,
    });
    setCover(null);
    setPdf(null);
    setFormError(null);
    setModalOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      // next_book_id kosong tetap dikirim agar pilihan lama bisa dihapus.
      if (v === '' && k !== 'next_book_id') return;
      // Waktu lokal (WIB) → ISO UTC agar server tidak salah zona waktu.
      fd.append(k, k === 'sale_ends_at' ? new Date(v).toISOString() : v);
    });
    if (cover) fd.append('cover', cover);
    try {
      let bookId = editing?.id;
      const track = (label: string) => (loaded: number, total: number) => setProgress({ label, loaded, total });
      if (editing) {
        fd.append('_method', 'PUT');
        await uploadWithProgress(`${base}/${editing.id}`, fd, cover ? track('Mengunggah sampul') : undefined);
      } else {
        const res = await uploadWithProgress(base, fd, cover ? track('Mengunggah sampul') : undefined);
        bookId = res.book?.id;
      }
      // File PDF diunggah lewat endpoint terpisah, lalu diproses oleh queue worker.
      if (pdf && bookId) {
        const pf = new FormData();
        pf.append('file', pdf);
        setProgress({ label: 'Mengunggah PDF', loaded: 0, total: pdf.size });
        await uploadWithProgress(`${base}/${bookId}/upload`, pf, track('Mengunggah PDF'));
      }
      setModalOpen(false);
      setNotice({
        tone: 'success',
        text: `${editing ? 'Perubahan disimpan' : 'Buku ditambahkan'}${pdf ? '. PDF sedang dikonversi menjadi halaman — statusnya tampil di kolom Halaman.' : '.'}`,
      });
      await mutate();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Gagal menyimpan buku.');
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  const reprocess = async (b: AdminBook) => {
    try {
      await api.post(`${base}/${b.id}/reprocess`, {});
      await mutate();
    } catch (err: unknown) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal mengulang konversi.' });
    }
  };

  const remove = async (b: AdminBook) => {
    const ok = await confirmDialog({
      title: `Hapus "${b.title}"?`,
      text: 'Buku, sampul, dan semua halamannya akan dihapus permanen. Tindakan ini tidak dapat dibatalkan.',
      confirmText: 'Hapus buku',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`${base}/${b.id}`);
      setNotice({ tone: 'success', text: `"${b.title}" dihapus.` });
      await mutate();
    } catch (err: unknown) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Gagal menghapus buku.' });
    }
  };

  return (
    <>
      <AdminHeader
        title={mode === 'admin' ? 'Buku' : 'Buku saya'}
        description={
          mode === 'admin'
            ? `${data?.total ?? 0} judul di katalog`
            : `${data?.total ?? 0} judul · unggah PDF, atur harga & promo. Buku berstatus Terbit tampil di toko setelah PDF selesai diproses.`
        }
        actions={
          <>
            <SearchInput value={search} onChange={setSearch} placeholder="Cari judul atau penulis…" />
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Tambah buku
            </Button>
          </>
        }
      />

      {notice && (
        <Notice tone={notice.tone} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}

      <div className="mb-4">
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
      </div>

      <Panel className="overflow-hidden">
        <Table
          colSpan={6}
          loading={isLoading}
          empty={!books.length}
          head={
            <tr>
              <th className={th}>Buku</th>
              <th className={`${th} hidden lg:table-cell`}>Kategori</th>
              <th className={`${th} hidden text-right sm:table-cell`}>Harga</th>
              <th className={`${th} hidden md:table-cell`}>Halaman</th>
              <th className={`${th} hidden sm:table-cell`}>Status</th>
              <th className={th}></th>
            </tr>
          }
        >
          {books.map((b) => (
            <tr key={b.id} className="hover:bg-slate-50/60">
              <td className={td}>
                <div className="flex items-center gap-3">
                  <span className="relative aspect-[3/4.3] w-10 shrink-0 overflow-hidden rounded ring-1 ring-slate-900/5">
                    <BookCover title={b.title} src={resolveCover(b.cover_url)} />
                  </span>
                  <div className="min-w-0">
                    <p className="line-clamp-2 font-semibold text-slate-900 md:line-clamp-1">{b.title}</p>
                    <p className="text-xs text-slate-500">
                      {b.author}
                      {mode === 'admin' && b.creator && (
                        <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-inset ring-violet-200">
                          Kreator · {b.creator.creator_profile?.display_name ?? b.creator.name}
                        </span>
                      )}
                    </p>
                    {/* Layar kecil: kolom Halaman & Status disembunyikan, jadi ringkasannya tampil di sini. */}
                    <div className="md:hidden">
                      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className={`sm:hidden ${b.status === 'published' ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}`}>
                          {b.status === 'published' ? 'Terbit' : 'Draf'} ·
                        </span>
                        {b.total_pages ?? 0} hlm
                        <span className="sm:hidden">· {formatRupiah(b.is_on_sale && b.sale_price ? b.sale_price : b.price)}</span>
                      </p>
                      <PdfStatus book={b} mode={mode} onRetry={() => reprocess(b)} />
                    </div>
                  </div>
                </div>
              </td>
              <td className={`${td} hidden text-slate-600 lg:table-cell`}>{b.category?.name ?? '—'}</td>
              <td className={`${td} hidden text-right tabular-nums sm:table-cell`}>
                {b.is_on_sale && b.sale_price ? (
                  <>
                    <span className="font-semibold text-rose-600">{formatRupiah(b.sale_price)}</span>
                    <span className="block text-xs text-slate-400 line-through">{formatRupiah(b.price)}</span>
                  </>
                ) : (
                  <span className="text-slate-900">{formatRupiah(b.price)}</span>
                )}
              </td>
              <td className={`${td} hidden text-slate-600 md:table-cell`}>
                {b.total_pages ?? 0}
                <span className="text-xs text-slate-400"> · pratinjau {b.preview_pages ?? 5}</span>
                <PdfStatus book={b} mode={mode} onRetry={() => reprocess(b)} />
              </td>
              <td className={`${td} hidden sm:table-cell`}>
                <Badge variant={b.status === 'published' ? 'success' : 'default'} dot>
                  {b.status === 'published' ? 'Terbit' : 'Draf'}
                </Badge>
              </td>
              <td className={`${td} text-right`}>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(b)} aria-label={`Edit ${b.title}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => remove(b)} aria-label={`Hapus ${b.title}`} className="hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Panel>

      <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit buku' : 'Tambah buku'} maxWidth="2xl">
        <form onSubmit={submit} className="space-y-4">
          {formError && <Notice tone="error">{formError}</Notice>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Judul">
              <Input required value={form.title} onChange={set('title')} />
            </Field>
            <Field label="Penulis">
              <Input required value={form.author} onChange={set('author')} />
            </Field>
          </div>
          <Field label="Sinopsis">
            <Textarea required rows={4} value={form.synopsis} onChange={set('synopsis')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Harga (Rp)">
              <Input required type="number" min={0} step={500} value={form.price} onChange={set('price')} />
            </Field>
            <Field label="Kategori">
              <Select value={form.category_id} onChange={set('category_id')}>
                <option value="">Tanpa kategori</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.status} onChange={set('status')}>
                <option value="published">Terbit</option>
                <option value="draft">Draf</option>
              </Select>
            </Field>
            <Field label="Total halaman" hint="Terisi otomatis setelah PDF diproses">
              <Input type="number" min={0} value={form.total_pages} onChange={set('total_pages')} />
            </Field>
            <Field label="Halaman pratinjau gratis">
              <Input type="number" min={1} max={50} value={form.preview_pages} onChange={set('preview_pages')} />
            </Field>
          </div>
          <Field label="Buku lanjutan (opsional)" hint="Mis. PHP → Laravel. Tampil sebagai “Lanjutan seri ini” di halaman buku & di akhir buku saat membaca.">
            <Select value={form.next_book_id} onChange={set('next_book_id')}>
              <option value="">Otomatis (dari kebiasaan pembaca & kemiripan topik)</option>
              {allBooks
                .filter((b) => b.id !== editing?.id)
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                  </option>
                ))}
            </Select>
          </Field>
          <fieldset className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
            <legend className="px-1 text-sm font-semibold text-rose-700">Harga promo (opsional)</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Harga promo (Rp)"
                hint={
                  form.sale_price && form.price && Number(form.sale_price) < Number(form.price)
                    ? `Diskon ${Math.round((1 - Number(form.sale_price) / Number(form.price)) * 100)}% · kosongkan untuk mematikan promo`
                    : 'Harus lebih murah dari harga normal. Kosongkan = tanpa promo.'
                }
              >
                <Input type="number" min={0} step={500} value={form.sale_price} onChange={set('sale_price')} placeholder="mis. 79000" />
              </Field>
              <Field label="Promo berakhir" hint="Kosongkan = berlaku sampai dimatikan">
                <Input type="datetime-local" value={form.sale_ends_at} onChange={set('sale_ends_at')} disabled={!form.sale_price} />
              </Field>
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Sampul"
              hint={
                cover
                  ? `${cover.name} · ${fileSize(cover.size)} — otomatis dioptimalkan ke WebP`
                  : `${editing ? 'Kosongkan jika tidak diganti. ' : ''}JPG/PNG/WebP, ukuran bebas — otomatis dikompres agar cepat tampil`
              }
            >
              <Input type="file" accept="image/*" onChange={(e) => setCover(e.target.files?.[0] ?? null)} className="pt-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" />
            </Field>
            <Field
              label="File buku (PDF)"
              hint={
                pdf
                  ? `${pdf.name} · ${fileSize(pdf.size)}`
                  : editing?.source_file_path
                    ? 'Sudah ada PDF — unggah lagi untuk mengganti. Ukuran bebas'
                    : 'Ukuran bebas, diproses menjadi halaman'
              }
            >
              <Input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className="pt-2 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-xs" />
            </Field>
          </div>
          {progress && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5" role="status" aria-live="polite">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs font-semibold text-blue-900">
                <span>{progress.label}…</span>
                <span className="tabular-nums">
                  {fileSize(progress.loaded)} / {fileSize(progress.total)} · {progress.total ? Math.floor((progress.loaded / progress.total) * 100) : 0}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-blue-100">
                <div className="h-full rounded-full bg-blue-600 transition-[width] duration-300" style={{ width: `${progress.total ? (progress.loaded / progress.total) * 100 : 0}%` }} />
              </div>
              {progress.total > 0 && progress.loaded >= progress.total && <p className="mt-2 text-xs text-blue-800">Terkirim — server sedang memproses file…</p>}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Batal
            </Button>
            <Button type="submit" loading={saving}>
              {pdf && <FileUp className="h-4 w-4" />}
              {editing ? 'Simpan perubahan' : 'Tambah buku'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
