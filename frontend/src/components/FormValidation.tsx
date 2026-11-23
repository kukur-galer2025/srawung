'use client';

import { useEffect } from 'react';

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Nama kolom dari labelnya, mis. "Judul" atau "Harga (Rp)" (tanpa keterangan/opsional). */
function fieldName(el: Field): string {
  const label = el.labels?.[0];
  const raw = (label?.querySelector('span')?.textContent || label?.textContent || el.getAttribute('aria-label') || '').trim();
  return raw.replace(/\s*\((opsional|optional)\)\s*$/i, '').replace(/\s+/g, ' ').slice(0, 60);
}

/** Pesan bahasa Indonesia untuk setiap jenis kesalahan isian bawaan HTML. */
function messageFor(el: Field): string {
  const v = el.validity;
  const name = fieldName(el);
  const subject = name || 'Kolom ini';
  const input = el as HTMLInputElement;

  if (v.valueMissing) {
    if (input.type === 'checkbox') return 'Centang kotak ini untuk melanjutkan.';
    if (input.type === 'radio') return 'Pilih salah satu pilihan.';
    if (input.type === 'file') return name ? `Pilih file untuk ${name.toLowerCase()}.` : 'Pilih file terlebih dahulu.';
    if (el instanceof HTMLSelectElement) return name ? `Pilih ${name.toLowerCase()}.` : 'Pilih salah satu.';
    return `${subject} wajib diisi.`;
  }
  if (v.typeMismatch) {
    if (input.type === 'email') return 'Format email belum benar. Contoh: nama@email.com';
    if (input.type === 'url') return 'Alamat web harus lengkap, diawali https://';
    return `Format ${subject.toLowerCase()} belum benar.`;
  }
  if (v.tooShort) return `${subject} minimal ${input.minLength} karakter (sekarang ${input.value.length}).`;
  if (v.tooLong) return `${subject} maksimal ${input.maxLength} karakter.`;
  if (v.rangeUnderflow) return `${subject} minimal ${Number(input.min).toLocaleString('id-ID')}.`;
  if (v.rangeOverflow) return `${subject} maksimal ${Number(input.max).toLocaleString('id-ID')}.`;
  if (v.stepMismatch) return `${subject} harus bilangan bulat.`;
  if (v.badInput) return input.type === 'number' ? `${subject} harus berupa angka.` : `Isian ${subject.toLowerCase()} belum lengkap.`;
  if (v.patternMismatch) return input.title || `Format ${subject.toLowerCase()} belum sesuai.`;
  return el.validationMessage || 'Isian belum sesuai.';
}

/**
 * Mengganti gelembung validasi bawaan peramban ("Please fill out this field") di SEMUA formulir
 * dengan pesan bergaya Srawung berbahasa Indonesia, tepat di bawah kolom yang bermasalah.
 * Dipasang sekali di root layout.
 */
export function FormValidation() {
  useEffect(() => {
    let bubble: HTMLDivElement | null = null;
    let target: Field | null = null;
    let shownAt = 0;
    let frame = 0;

    const place = () => {
      if (!bubble || !target) return;
      const r = target.getBoundingClientRect();
      const width = Math.min(Math.max(r.width, 220), 360, window.innerWidth - 24);
      bubble.style.width = `${width}px`;
      bubble.style.left = `${Math.min(Math.max(12, r.left), window.innerWidth - width - 12)}px`;
      bubble.style.top = `${r.bottom + 8}px`;
      bubble.style.setProperty('--arrow-x', `${Math.min(Math.max(16, r.left + 22 - parseFloat(bubble.style.left)), width - 24)}px`);
    };
    const onViewportChange = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };

    const hide = () => {
      bubble?.remove();
      bubble = null;
      target = null;
      window.removeEventListener('scroll', onViewportChange, true);
      window.removeEventListener('resize', onViewportChange);
    };

    const show = (el: Field) => {
      hide();
      target = el;
      shownAt = Date.now();
      bubble = document.createElement('div');
      bubble.className = 'form-tip';
      bubble.setAttribute('role', 'alert');
      bubble.innerHTML = '<span class="form-tip-icon" aria-hidden="true">!</span><span class="form-tip-text"></span>';
      bubble.querySelector('.form-tip-text')!.textContent = messageFor(el);
      document.body.appendChild(bubble);
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.focus({ preventScroll: true });
      place();
      window.addEventListener('scroll', onViewportChange, true);
      window.addEventListener('resize', onViewportChange);
    };

    // 'invalid' tidak menggelembung → ditangkap di fase capture. Hanya kolom pertama yang dipandu.
    let batch = false;
    const onInvalid = (e: Event) => {
      const el = e.target as Field;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
      e.preventDefault();
      // Hanya kolom pertama yang ditandai merah, agar formulir tidak langsung terlihat penuh kesalahan.
      if (batch) return;
      el.setAttribute('data-invalid', 'true');
      batch = true;
      queueMicrotask(() => (batch = false));
      show(el);
    };

    const onEdit = (e: Event) => {
      const el = e.target as Element;
      if (el instanceof HTMLElement && el.hasAttribute('data-invalid') && (el as Field).checkValidity?.()) {
        el.removeAttribute('data-invalid');
      }
      if (el === target) hide();
    };
    const onPointer = (e: Event) => {
      if (bubble && Date.now() - shownAt > 300 && !bubble.contains(e.target as Node) && e.target !== target) hide();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && hide();

    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey);
    return () => {
      hide();
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return null;
}
