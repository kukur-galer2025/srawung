'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
}

const WIDTH = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-lg', xl: 'max-w-xl', '2xl': 'max-w-2xl', '3xl': 'max-w-3xl' };

const noop = () => () => {};

/**
 * Modal dirender lewat portal ke <body>: elemen halaman yang membuat stacking context
 * sendiri (navbar sticky, animasi reveal, transform) tidak bisa lagi menimpanya.
 */
export function Modal({ isOpen, onClose, title, children, maxWidth = 'md' }: ModalProps) {
  // true hanya di browser (aman untuk hydration: server & render pertama sama-sama false).
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal-backdrop fixed inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`modal-panel relative z-10 flex max-h-[92dvh] w-full ${WIDTH[maxWidth]} flex-col overflow-hidden rounded-t-2xl border border-slate-200/80 bg-white shadow-2xl sm:rounded-2xl`}
      >
        {title && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 sm:px-6 sm:py-4">
            <h3 className="min-w-0 truncate font-sans text-base font-semibold text-slate-900">{title}</h3>
            <button
              onClick={onClose}
              aria-label="Tutup"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:p-6">{children}</div>
      </div>
    </div>,
    document.body
  );
}
