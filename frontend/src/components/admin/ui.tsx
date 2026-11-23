'use client';

import React, { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Inbox, Loader2, Search, Upload, X } from 'lucide-react';

/*
 * Kit UI admin — gaya minimalis: latar putih, garis tipis, tanpa bayangan berat,
 * satu warna aksi utama (gelap) agar mata langsung tahu tombol mana yang penting.
 */

export function AdminHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-[22px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500 sm:text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </div>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200/80 bg-white ${className}`}>{children}</div>;
}

/** Judul bagian di dalam Panel. */
export function PanelHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800',
  secondary: 'border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
};

export function Button({
  variant = 'primary',
  loading,
  children,
  className = '',
  size = 'md',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; size?: 'sm' | 'md' }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-[13.5px]'
      } ${BTN[variant]} ${className}`}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

const fieldBase =
  'w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-slate-400 focus:ring-4 focus:ring-slate-900/5 disabled:bg-slate-50 disabled:text-slate-500';

export function Field({ label, hint, error, children }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-xs text-rose-600">{error}</span> : hint ? <span className="mt-1 block text-xs leading-relaxed text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className = '', ...p }, ref) {
  return <input ref={ref} {...p} className={`h-10 ${fieldBase} ${className}`} />;
});

export function Select({ className = '', ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={`h-10 ${fieldBase} ${className}`} />;
}

export function Textarea({ className = '', ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={`py-2.5 ${fieldBase} ${className}`} />;
}

/**
 * Pemilih file bergaya Srawung (pengganti tombol "Choose File / No file chosen" bawaan peramban).
 * Dipakai di dalam <Field>: label Field membuka pemilih file saat diklik.
 */
export function FilePicker({ accept, file, onPick, placeholder = 'Pilih file' }: { accept: string; file: File | null; onPick: (f: File | null) => void; placeholder?: string }) {
  return (
    <span className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-lg border border-dashed border-slate-300 bg-white pl-3 pr-1.5 text-sm transition hover:border-slate-400 hover:bg-slate-50">
      <Upload className="h-4 w-4 shrink-0 text-slate-400" />
      <span className={`min-w-0 flex-1 truncate ${file ? 'font-medium text-slate-900' : 'text-slate-500'}`}>{file ? file.name : placeholder}</span>
      <span className="shrink-0 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">{file ? 'Ganti' : 'Pilih'}</span>
      <input type="file" accept={accept} className="sr-only" onChange={(e) => onPick(e.target.files?.[0] ?? null)} />
    </span>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`h-9 pl-9 pr-8 ${fieldBase}`} />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Hapus pencarian" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-700">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/** Tab bergaris bawah — jelas mana yang aktif tanpa kotak berlapis. */
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { id: T; label: string; count?: number }[] }) {
  return (
    <div className="tabs-fade no-scrollbar -mb-px flex gap-5 overflow-x-auto border-b border-slate-200" role="tablist">
      {items.map((t) => {
        const active = value === t.id;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2.5 pt-1 text-[13.5px] transition ${
              active ? 'border-slate-900 font-medium text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`rounded-full px-1.5 text-[11px] leading-[18px] ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function Table({
  head,
  children,
  empty,
  loading,
  colSpan,
  emptyText = 'Belum ada data.',
}: {
  head: ReactNode;
  children: ReactNode;
  empty?: boolean;
  loading?: boolean;
  colSpan: number;
  emptyText?: string;
}) {
  const ref = useRef<HTMLTableElement>(null);
  useResponsiveTable(ref);
  return (
    <div className="overflow-x-auto">
      <table ref={ref} className="rtable w-full text-left text-sm">
        <thead className="border-b border-slate-100 text-xs font-medium text-slate-500">{head}</thead>
        <tbody className="divide-y divide-slate-100 [&>tr]:transition-colors [&>tr:hover]:bg-slate-50/70">
          {loading ? (
            <tr>
              <td colSpan={colSpan} className="py-14 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
              </td>
            </tr>
          ) : empty ? (
            <tr>
              <td colSpan={colSpan} className="py-14 text-center">
                <Inbox className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                <span className="text-sm text-slate-400">{emptyText}</span>
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Di HP (< 640 px) tabel tampil sebagai kartu: tiap sel diberi label dari kepala kolomnya
 * (data-label), sel tanpa judul kolom dianggap tombol aksi (data-actions) dan ditaruh di
 * bawah kartu, sehingga tombol seperti "Periksa" tidak pernah terdorong keluar layar.
 * Gaya kartunya di globals.css (blok "Tabel responsif").
 */
export function useResponsiveTable(ref: React.RefObject<HTMLTableElement | null>) {
  useEffect(() => {
    const table = ref.current;
    if (!table) return;
    const label = () => {
      const heads = [...table.querySelectorAll('thead th')].map((th) => th.textContent?.trim() ?? '');
      table.querySelectorAll(':scope > tbody > tr').forEach((tr) => {
        [...tr.children].forEach((cell, i) => {
          const td = cell as HTMLTableCellElement;
          if (td.colSpan > 1) {
            td.setAttribute('data-full', '');
            return;
          }
          const h = heads[i] ?? '';
          if (h) {
            td.setAttribute('data-label', h);
            td.removeAttribute('data-actions');
          } else {
            td.removeAttribute('data-label');
            td.setAttribute('data-actions', '');
          }
        });
      });
    };
    label();
    const mo = new MutationObserver(label);
    mo.observe(table, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [ref]);
}

export const th = 'px-4 py-3 font-medium';
export const td = 'px-4 py-3 align-middle';

export function Notice({ tone, children, onClose }: { tone: 'success' | 'error'; children: ReactNode; onClose?: () => void }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${
        tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'
      }`}
    >
      <div>{children}</div>
      {onClose && (
        <button onClick={onClose} aria-label="Tutup" className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Angka ringkas di atas halaman (dashboard, laporan, newsletter). */
export function Stat({ label, value, hint, tone = 'default' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'attention' }) {
  return (
    <div className={`min-w-0 rounded-xl border bg-white p-4 ${tone === 'attention' ? 'border-amber-300 ring-4 ring-amber-50' : 'border-slate-200/80'}`}>
      <p className="text-[13px] text-slate-500">{label}</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-slate-900 sm:text-2xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
