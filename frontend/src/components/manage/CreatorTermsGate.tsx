'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ExternalLink, FileCheck2, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { flash } from '@/lib/flash';
import { formatRupiah } from '@/lib/utils';
import type { CreatorSummary } from '@/lib/creator';

/**
 * Jendela persetujuan Syarat & Ketentuan Kreator. Muncul (dan tidak bisa ditutup) selama
 * kreator belum menyetujui versi S&K yang berlaku — backend juga menolak terbit buku &
 * penarikan saldo sebelum disetujui.
 */
export function CreatorTermsGate() {
  const { data, mutate } = useSWR<CreatorSummary>('/creator/summary', (url: string) => api.get(url));
  const [agree, setAgree] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data?.terms?.needs_acceptance) return null;

  const share = 100 - data.commission_percent;
  const updated = !!data.terms.accepted_version;

  const accept = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post('/creator/terms/accept', { version: data.terms.version, agree: true });
      await mutate({ ...data, terms: res.terms }, { revalidate: true });
      flash.success('S&K Kreator disetujui', 'Selamat berkarya! Anda sudah bisa menerbitkan buku dan menarik saldo.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan persetujuan.');
    } finally {
      setSaving(false);
    }
  };

  const points = [
    'Buku yang Anda terbitkan adalah karya Anda sendiri atau Anda memegang izin sah untuk menjualnya, dan isinya tidak melanggar hukum.',
    `Hak cipta tetap milik Anda. Anda menerima ${share}% dari harga yang dibayar pembeli (komisi Srawung ${data.commission_percent}%). Diskon voucher Anda mengurangi bagian Anda.`,
    `Saldo dapat ditarik mulai ${formatRupiah(data.min_payout)}, dengan biaya admin ${formatRupiah(data.payout_fee)} per penarikan yang dipotong dari jumlah yang ditarik.`,
    'Transfer dilakukan admin dalam 1–3 hari kerja ke rekening/e-wallet terdaftar. Kesalahan data rekening menjadi tanggung jawab Anda.',
    'Srawung dapat menurunkan buku dan menahan saldo terkait bila terjadi pelanggaran hak cipta atau ketentuan.',
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="creator-terms-title">
      <div className="modal-backdrop fixed inset-0 bg-slate-950/50 backdrop-blur-sm" />
      <div className="modal-panel relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="shrink-0 border-b border-slate-100 px-6 pb-4 pt-6">
          <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <h2 id="creator-terms-title" className="font-sans text-lg font-semibold text-slate-900">
            {updated ? 'Syarat & Ketentuan Kreator diperbarui' : 'Syarat & Ketentuan Kreator'}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {updated ? 'Mohon baca dan setujui versi terbaru untuk melanjutkan.' : 'Sebelum mulai menerbitkan dan menjual buku, mohon baca poin penting berikut.'}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <ol className="space-y-3">
            {points.map((p, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{i + 1}</span>
                {p}
              </li>
            ))}
          </ol>
          <Link href="/syarat-kreator" target="_blank" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:text-blue-900">
            Baca Syarat & Ketentuan Kreator lengkap
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="shrink-0 space-y-3 border-t border-slate-100 bg-slate-50/60 px-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-violet-600" />
            <span>Saya telah membaca dan menyetujui Syarat & Ketentuan Kreator Srawung, termasuk ketentuan bagi hasil, minimal penarikan, dan biaya admin.</span>
          </label>
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button
            onClick={accept}
            disabled={!agree || saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Setuju & lanjutkan
          </button>
        </div>
      </div>
    </div>
  );
}
