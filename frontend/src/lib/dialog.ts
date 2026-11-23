'use client';

import Swal, { type SweetAlertIcon } from 'sweetalert2';
import { flash } from '@/lib/flash';

/*
 * Dialog & notifikasi Srawung (SweetAlert2) — pengganti window.confirm/alert.
 * Gaya tombol & panel diatur di sini + globals.css (blok "SweetAlert2"),
 * jadi semua dialog tampil seragam dengan desain situs.
 */

type Tone = 'primary' | 'danger' | 'success';

const BTN_BASE = 'inline-flex h-11 items-center justify-center rounded-xl px-5 text-sm font-semibold transition focus:outline-none focus-visible:ring-4';
const BTN_TONE: Record<Tone, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-600/30',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-600/30',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600/30',
};
const BTN_CANCEL = 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400/30';

const ICON: Record<Tone, SweetAlertIcon> = { primary: 'question', danger: 'warning', success: 'success' };

const SVG = (path: string) =>
  `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
/** Ikon garis (gaya lucide) di dalam lingkaran berwarna lembut. */
const ICON_HTML: Record<Tone, string> = {
  primary: SVG('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  danger: SVG('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/>'),
  success: SVG('<path d="M20 6 9 17l-5-5"/>'),
};

const base = Swal.mixin({
  buttonsStyling: false,
  reverseButtons: true,
  focusCancel: true,
  customClass: {
    popup: 'amania-swal',
    title: 'amania-swal-title',
    htmlContainer: 'amania-swal-text',
    actions: 'amania-swal-actions',
    cancelButton: `${BTN_BASE} ${BTN_CANCEL}`,
  },
});

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: Tone;
}

/** Tampilkan dialog konfirmasi. Resolve `true` jika pengguna menekan tombol konfirmasi. */
export async function confirmDialog({ title, text, confirmText = 'Ya, lanjutkan', cancelText = 'Batal', tone = 'primary' }: ConfirmOptions): Promise<boolean> {
  const res = await base.fire({
    title,
    text,
    icon: ICON[tone],
    iconHtml: ICON_HTML[tone],
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    customClass: {
      popup: 'amania-swal',
      icon: `amania-swal-icon amania-swal-icon-${tone}`,
      title: 'amania-swal-title',
      htmlContainer: 'amania-swal-text',
      actions: 'amania-swal-actions',
      cancelButton: `${BTN_BASE} ${BTN_CANCEL}`,
      confirmButton: `${BTN_BASE} ${BTN_TONE[tone]}`,
    },
  });
  return res.isConfirmed;
}

/**
 * Notifikasi singkat — memakai flash message Srawung (lihat src/lib/flash.ts),
 * jadi semua notifikasi tampil seragam. Argumen kedua opsional: keterangan.
 */
export const toast = {
  success: (title: string, description?: string) => flash.success(title, description),
  error: (title: string, description?: string) => flash.error(title, description),
  info: (title: string, description?: string) => flash.info(title, description),
  warning: (title: string, description?: string) => flash.warning(title, description),
};

export interface PromptOptions {
  title: string;
  text?: string;
  inputLabel?: string;
  placeholder?: string;
  value?: string;
  inputType?: 'text' | 'url' | 'password';
  confirmText?: string;
  /** Teks tombol tambahan (mis. "Hapus tautan"). Bila ditekan, hasilnya `''`. */
  denyText?: string;
  validate?: (value: string) => string | null;
}

/**
 * Dialog isian satu baris (pengganti window.prompt).
 * Resolve string isian, `''` bila tombol deny ditekan, atau `null` bila dibatalkan.
 */
export async function promptDialog({
  title,
  text,
  inputLabel,
  placeholder,
  value = '',
  inputType = 'text',
  confirmText = 'Simpan',
  denyText,
  validate,
}: PromptOptions): Promise<string | null> {
  const res = await base.fire({
    title,
    text,
    input: inputType,
    inputLabel,
    inputPlaceholder: placeholder,
    inputValue: value,
    showCancelButton: true,
    showDenyButton: !!denyText,
    focusCancel: false,
    confirmButtonText: confirmText,
    denyButtonText: denyText,
    cancelButtonText: 'Batal',
    inputValidator: (v) => (validate ? validate(String(v ?? '')) : null),
    customClass: {
      popup: 'amania-swal',
      title: 'amania-swal-title',
      htmlContainer: 'amania-swal-text',
      actions: 'amania-swal-actions',
      input: 'amania-swal-input',
      inputLabel: 'amania-swal-input-label',
      validationMessage: 'amania-swal-validation',
      cancelButton: `${BTN_BASE} ${BTN_CANCEL}`,
      denyButton: `${BTN_BASE} border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 focus-visible:ring-rose-600/20`,
      confirmButton: `${BTN_BASE} ${BTN_TONE.primary}`,
    },
  });
  if (res.isDenied) return '';
  return res.isConfirmed ? String(res.value ?? '').trim() : null;
}
