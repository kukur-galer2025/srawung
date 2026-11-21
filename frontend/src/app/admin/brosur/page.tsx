'use client';

import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { ArrowDown, ArrowUp, CheckCheck, Download, ExternalLink, FileText, LayoutGrid, Rows2, Search, Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { formatRupiah } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, PanelHeader } from '@/components/admin/ui';
import { BookCover } from '@/components/BookCard';
import type { BookSummary, Paginated } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const MAX_BOOKS = 40;

type Layout = 'katalog' | 'sorotan';

const LAYOUTS: { id: Layout; name: string; desc: string; perPage: number; icon: typeof LayoutGrid }[] = [
  { id: 'katalog', name: 'Katalog', desc: '6 buku per halaman, ringkas', perPage: 6, icon: LayoutGrid },
  { id: 'sorotan', name: 'Sorotan', desc: '2 buku per halaman, sampul besar', perPage: 2, icon: Rows2 },
];

/** Gambar mini tata letak, supaya admin tahu hasilnya sebelum membuat PDF. */
function LayoutThumb({ layout }: { layout: Layout }) {
  return (
    <span className="grid h-16 w-12 shrink-0 gap-0.5 rounded-md bg-white p-1 ring-1 ring-slate-200" style={{ gridTemplateColumns: layout === 'katalog' ? '1fr 1fr' : '1fr' }}>
      {Array.from({ length: layout === 'katalog' ? 6 : 2 }).map((_, i) => (
        <span key={i} className="flex gap-0.5 rounded-xs bg-emerald-50 p-0.5">
          <span className="w-1/3 rounded-[1px] bg-emerald-700/70" />
          <span className="flex-1 space-y-0.5">
            <span className="block h-0.5 rounded bg-slate-300" />
            <span className="block h-0.5 w-2/3 rounded bg-slate-200" />
          </span>
        </span>
      ))}
    </span>
  );
}

export default function AdminBrochurePage() {
  const { data: catalog, isLoading } = useSWR<Paginated<BookSummary>>('/admin/books?status=published&per_page=100', (url: string) => api.get(url));
  const books = useMemo(() => catalog?.data ?? [], [catalog]);
  const bookMap = useMemo(() => new Map(books.map((b) => [b.id, b])), [books]);

  const [picked, setPicked] = useState<number[]>([]);
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<Layout>('katalog');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [promoNote, setPromoNote] = useState('');
  const [showPrices, setShowPrices] = useState(true);
  const [includeCover, setIncludeCover] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdf, setPdf] = useState<{ url: string; name: string; size: number } | null>(null);

  // Bebaskan memori object URL lama saat diganti / halaman ditutup.
  useEffect(() => () => (pdf ? URL.revokeObjectURL(pdf.url) : undefined), [pdf]);

  const filtered = books.filter((b) => {
    const q = query.trim().toLowerCase();
    return !q || b.title.toLowerCase().includes(q) || (b.author ?? '').toLowerCase().includes(q) || (b.category?.name ?? '').toLowerCase().includes(q);
  });

  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_BOOKS ? p : [...p, id]));
  const move = (index: number, dir: -1 | 1) =>
    setPicked((p) => {
      const next = [...p];
      const to = index + dir;
      if (to < 0 || to >= next.length) return p;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  const selectAllShown = () => setPicked((p) => [...p, ...filtered.map((b) => b.id).filter((id) => !p.includes(id))].slice(0, MAX_BOOKS));

  const perPage = LAYOUTS.find((l) => l.id === layout)!.perPage;
  const estimatedPages = picked.length ? Math.ceil(picked.length / perPage) + (includeCover ? 2 : 0) : 0;

  const generate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const token = localStorage.getItem('amania_token');
      const res = await fetch(`${API_URL}/admin/brochure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          book_ids: picked,
          layout,
          title: title.trim() || null,
          subtitle: subtitle.trim() || null,
          promo_code: promoCode.trim() || null,
          promo_note: promoNote.trim() || null,
          show_prices: showPrices,
          include_cover: includeCover,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const first = body.errors ? Object.values(body.errors as Record<string, string[]>)[0]?.[0] : null;
        throw new Error(first || body.message || 'Brosur gagal dibuat.');
      }
      const blob = await res.blob();
      // Header Content-Disposition tidak terbaca lintas domain (CORS), jadi nama file dibuat di sini.
      const slug = (title.trim() || 'Katalog').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40);
      const name = `Brosur-Srawung-${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
      setPdf({ url: URL.createObjectURL(blob), name, size: blob.size });
      setTimeout(() => document.getElementById('pratinjau-brosur')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Brosur gagal dibuat.');
    } finally {
      setGenerating(false);
    }
  };

  const download = () => {
    if (!pdf) return;
    const a = document.createElement('a');
    a.href = pdf.url;
    a.download = pdf.name;
    a.click();
  };

  return (
    <>
      <AdminHeader
        title="Brosur PDF"
        description="Pilih buku, atur tampilannya, lalu unduh brosur siap cetak atau kirim lewat WhatsApp. Setiap buku diberi QR menuju halaman belinya."
      />
      {error && (
        <Notice tone="error" onClose={() => setError(null)}>
          {error}
        </Notice>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-5">
        {/* ---------- Pilih buku ---------- */}
        <Panel className="lg:col-span-3">
          <PanelHeader
            title={`1. Pilih buku (${picked.length}/${MAX_BOOKS})`}
            description="Klik sampul untuk memilih. Urutan klik = urutan di brosur."
            actions={
              <div className="flex gap-1.5">
                <Button size="sm" variant="secondary" onClick={selectAllShown} disabled={!filtered.length}>
                  <CheckCheck className="h-4 w-4" />
                  Pilih semua
                </Button>
                {picked.length > 0 && (
                  <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
                    Kosongkan
                  </Button>
                )}
              </div>
            }
          />
          <div className="p-4 sm:p-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari judul, penulis, atau kategori…" className="pl-9" />
            </div>

            {isLoading ? (
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4.3] animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : !books.length ? (
              <p className="mt-6 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">Belum ada buku berstatus Terbit.</p>
            ) : (
              <div className="mt-4 grid max-h-136 grid-cols-3 gap-3 overflow-y-auto pr-1 sm:grid-cols-4 md:grid-cols-5">
                {filtered.map((b) => {
                  const pos = picked.indexOf(b.id);
                  const on = pos >= 0;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => toggle(b.id)}
                      aria-pressed={on}
                      title={b.title}
                      className={`group text-left transition ${!on && picked.length >= MAX_BOOKS ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                      <span
                        className={`relative block aspect-[3/4.3] overflow-hidden rounded-lg ring-2 transition ${on ? 'ring-emerald-500 shadow-lg shadow-emerald-900/15' : 'ring-transparent group-hover:ring-slate-300'}`}
                      >
                        <BookCover title={b.title} src={b.cover_url} srcSet={b.cover_srcset} placeholder={b.cover_placeholder} sizes="120px" />
                        {on && (
                          <span className="absolute right-1.5 top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white shadow">
                            {pos + 1}
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 line-clamp-2 text-xs font-medium leading-snug text-slate-800">{b.title}</span>
                      <span className="text-[11px] text-slate-500">{formatRupiah(b.effective_price ?? b.price)}</span>
                    </button>
                  );
                })}
                {!filtered.length && <p className="col-span-full py-6 text-center text-sm text-slate-500">Tidak ada buku yang cocok.</p>}
              </div>
            )}
          </div>

          {picked.length > 1 && (
            <div className="border-t border-slate-100 p-4 sm:p-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Urutan di brosur</p>
              <ol className="space-y-1.5">
                {picked.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm">
                    <span className="w-5 text-center text-xs font-bold text-emerald-700">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-slate-800">{bookMap.get(id)?.title ?? `Buku #${id}`}</span>
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Naikkan" className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-25">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label="Turunkan" className="rounded p-1 text-slate-500 hover:bg-white disabled:opacity-25">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => toggle(id)} aria-label="Keluarkan" className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </Panel>

        {/* ---------- Atur tampilan ---------- */}
        <Panel className="lg:sticky lg:top-20 lg:col-span-2">
          <PanelHeader title="2. Atur brosur" />
          <div className="space-y-4 p-4 sm:p-5">
            <Field label="Tata letak">
              <div className="grid grid-cols-2 gap-2">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => setLayout(l.id)}
                    aria-pressed={layout === l.id}
                    className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition ${layout === l.id ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <LayoutThumb layout={l.id} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{l.name}</span>
                      <span className="block text-xs leading-snug text-slate-500">{l.desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Judul brosur">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Katalog Buku Pilihan" />
            </Field>
            <Field label="Kalimat pembuka (opsional)">
              <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={160} placeholder="Buku digital untuk belajar skill baru…" />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Kode promo (opsional)" hint="Pastikan kodenya sudah dibuat di menu Kupon.">
                <Input value={promoCode} onChange={(e) => setPromoCode(e.target.value.toUpperCase())} maxLength={30} placeholder="BROSUR10" />
              </Field>
              <Field label="Keterangan promo">
                <Input value={promoNote} onChange={(e) => setPromoNote(e.target.value)} maxLength={120} placeholder="Diskon 10% s.d. 31 Des" disabled={!promoCode.trim()} />
              </Field>
            </div>

            <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Tampilkan harga (harga coret bila sedang promo)
              </label>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" checked={includeCover} onChange={(e) => setIncludeCover(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
                Sampul depan &amp; belakang (cara beli, QR katalog, WhatsApp)
              </label>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
              <p className="text-xs text-slate-500">{picked.length ? `${picked.length} buku · ±${estimatedPages} halaman A4` : 'Belum ada buku dipilih'}</p>
              <Button onClick={generate} loading={generating} disabled={!picked.length}>
                <Sparkles className="h-4 w-4" />
                Buat brosur
              </Button>
            </div>
          </div>
        </Panel>
      </div>

      {/* ---------- Hasil ---------- */}
      {pdf && (
        <div id="pratinjau-brosur" className="mt-6 scroll-mt-20">
          <Panel>
            <PanelHeader
              title="3. Pratinjau"
              description={`${pdf.name} · ${(pdf.size / 1024 / 1024).toFixed(1)} MB`}
              actions={
                <div className="flex gap-1.5">
                  <a href={pdf.url} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                    <ExternalLink className="h-4 w-4" />
                    Buka
                  </a>
                  <Button size="sm" onClick={download}>
                    <Download className="h-4 w-4" />
                    Unduh PDF
                  </Button>
                </div>
              }
            />
            <iframe src={pdf.url} title="Pratinjau brosur" className="h-[80vh] w-full rounded-b-2xl bg-slate-100" />
          </Panel>
        </div>
      )}

      {!pdf && (
        <p className="mt-6 flex items-center gap-2 text-xs text-slate-400">
          <FileText className="h-4 w-4" />
          Brosur dibuat ulang setiap kali tombol ditekan, jadi harga & promo selalu yang terbaru.
        </p>
      )}
    </>
  );
}
