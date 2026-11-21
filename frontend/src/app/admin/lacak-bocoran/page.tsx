'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ImageUp, ScanSearch, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { AdminHeader, Button, Field, Input, Notice, Panel, PanelHeader, Table, td, th } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';

interface LookupResult {
  valid: boolean;
  code: string;
  user: { id: number; name: string; email: string; whatsapp: string | null; role: string; is_blocked: boolean; created_at: string };
  pages_opened_30d: number;
  sessions: { id: number; started_at: string; last_seen_at: string | null; ip_address: string; device: string | null; is_active: boolean; book: { title: string; slug: string } | null }[];
}

/**
 * Tonjolkan watermark forensik (kode AM…-…) dari tangkapan layar yang bocor.
 * Diproses sepenuhnya di browser: gambar dikurangi versi buramnya lalu kontrasnya
 * diperkuat, sehingga teks bertegangan rendah yang tak terlihat menjadi jelas.
 */
function enhance(img: HTMLImageElement, out: HTMLCanvasElement, gain: number) {
  const maxW = 2400;
  const scale = Math.min(1, maxW / img.naturalWidth);
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(img, 0, 0, w, h);
  const orig = sctx.getImageData(0, 0, w, h);

  // Versi buram: perkecil ±8× lalu perbesar kembali dengan penghalusan.
  const small = document.createElement('canvas');
  small.width = Math.max(1, Math.round(w / 8));
  small.height = Math.max(1, Math.round(h / 8));
  const smctx = small.getContext('2d')!;
  smctx.imageSmoothingQuality = 'high';
  smctx.drawImage(src, 0, 0, small.width, small.height);
  const blurC = document.createElement('canvas');
  blurC.width = w;
  blurC.height = h;
  const bctx = blurC.getContext('2d', { willReadFrequently: true })!;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, w, h);
  const blur = bctx.getImageData(0, 0, w, h);

  out.width = w;
  out.height = h;
  const octx = out.getContext('2d')!;
  const res = octx.createImageData(w, h);
  const a = orig.data;
  const b = blur.data;
  const r = res.data;
  for (let i = 0; i < a.length; i += 4) {
    const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
    const blum = 0.299 * b[i] + 0.587 * b[i + 1] + 0.114 * b[i + 2];
    const v = Math.max(0, Math.min(255, (lum - blum) * gain + 128));
    r[i] = r[i + 1] = r[i + 2] = v;
    r[i + 3] = 255;
  }
  octx.putImageData(res, 0, 0);
}

export default function LeakTracePage() {
  const [file, setFile] = useState<File | null>(null);
  const [gain, setGain] = useState(28);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.onerror = () => setError('Gambar tidak bisa dibuka. Gunakan PNG atau JPG.');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (img && canvasRef.current) enhance(img, canvasRef.current, gain);
  }, [img, gain]);

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await api.get(`/admin/leaks/lookup?code=${encodeURIComponent(code.trim())}`));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Kode tidak ditemukan.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <AdminHeader
        title="Lacak bocoran"
        description="Setiap halaman buku memuat kode akun pembaca yang nyaris tak terlihat. Unggah tangkapan layar yang tersebar untuk menonjolkan kodenya, lalu cocokkan dengan akun — tetap berfungsi walau nama/email di watermark sudah dipotong."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader title="1. Tonjolkan kode" description="Diproses di browser Anda — gambar tidak diunggah ke server." />
          <div className="space-y-4 p-5">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 px-4 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50/40">
              <ImageUp className="h-7 w-7 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">{file ? file.name : 'Pilih tangkapan layar (PNG/JPG)'}</span>
              <span className="text-xs text-slate-500">Semakin asli (tidak dikompres ulang), semakin jelas hasilnya.</span>
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  setError(null);
                  setImg(null);
                  setFile(e.target.files?.[0] ?? null);
                }}
              />
            </label>

            {img && (
              <>
                <div className="flex items-center gap-3">
                  <span className="shrink-0 text-xs font-semibold text-slate-600">Kontras</span>
                  <input type="range" min={8} max={80} value={gain} onChange={(e) => setGain(Number(e.target.value))} className="w-full accent-blue-700" />
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-500">{gain}×</span>
                </div>
                <div className="max-h-[70vh] overflow-auto rounded-xl bg-slate-900 ring-1 ring-slate-200">
                  <canvas ref={canvasRef} className="block h-auto w-full min-w-[640px]" />
                </div>
                <p className="text-xs text-slate-500">
                  Cari teks berulang berbentuk <span className="font-mono font-semibold text-slate-700">AM…-…</span> (mis. AM4-7XF). Naikkan kontras bila samar; perbesar
                  dengan menggulir area gambar.
                </p>
              </>
            )}
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="2. Cocokkan dengan akun" />
            <form onSubmit={lookup} className="space-y-3 p-5">
              <Field label="Kode yang terbaca" hint="Huruf besar/kecil & tanda hubung tidak masalah.">
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="AM4-7XF" className="font-mono uppercase" maxLength={40} />
              </Field>
              <Button type="submit" loading={loading} className="w-full">
                <ScanSearch className="h-4 w-4" />
                Cari pemilik akun
              </Button>
            </form>
          </Panel>

          {error && <Notice tone="error">{error}</Notice>}

          {result && (
            <Panel>
              <div className="space-y-4 p-5">
                {!result.valid && (
                  <div className="flex gap-2.5 rounded-xl bg-amber-50 p-3.5 text-sm text-amber-900 ring-1 ring-amber-200">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Kode cek tidak cocok — kemungkinan ada huruf yang salah baca. Kode yang benar untuk akun ini adalah{' '}
                      <span className="font-mono font-semibold">{result.code}</span>; bandingkan dengan gambar sebelum bertindak.
                    </span>
                  </div>
                )}
                {result.valid && (
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                    <ShieldCheck className="h-4 w-4" />
                    Kode valid — cocok dengan akun berikut
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{result.user.name}</p>
                    <p className="wrap-anywhere text-sm text-slate-600">{result.user.email}</p>
                    {result.user.whatsapp && <p className="text-sm text-slate-500">WA {result.user.whatsapp}</p>}
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {result.user.is_blocked ? <Badge variant="danger">Diblokir</Badge> : <Badge variant="success">Aktif</Badge>}
                      <Badge>{result.pages_opened_30d.toLocaleString('id-ID')} halaman dibuka (30 hari)</Badge>
                    </div>
                  </div>
                </div>
                <Link href="/admin/pengguna" className="inline-flex text-sm font-semibold text-blue-700 hover:underline">
                  Kelola akun ini di menu Pengguna →
                </Link>
              </div>
            </Panel>
          )}
        </div>
      </div>

      {result && result.sessions.length > 0 && (
        <Panel className="mt-6 overflow-hidden">
          <PanelHeader title="Riwayat sesi baca terbaru" description="Waktu, buku, alamat IP, dan perangkat — cocokkan dengan jam pada watermark di tangkapan layar." />
          <Table
            colSpan={5}
            head={
              <tr>
                <th className={th}>Buku</th>
                <th className={th}>Mulai</th>
                <th className={th}>Terakhir aktif</th>
                <th className={th}>IP</th>
                <th className={th}>Perangkat</th>
              </tr>
            }
          >
            {result.sessions.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className={`${td} font-medium text-slate-900`}>{s.book?.title ?? '—'}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{formatDateTime(s.started_at)}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{s.last_seen_at ? formatDateTime(s.last_seen_at) : '—'}</td>
                <td className={`${td} font-mono text-xs text-slate-600`}>{s.ip_address}</td>
                <td className={`${td} max-w-[18rem] truncate text-xs text-slate-500`} title={s.device ?? ''}>
                  {s.device ?? '—'}
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      )}
    </>
  );
}
