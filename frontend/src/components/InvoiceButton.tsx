'use client';

import { useState } from 'react';
import { FileDown, Loader2 } from 'lucide-react';
import { downloadFile } from '@/lib/api';
import { toast } from '@/lib/dialog';

/**
 * Tombol unduh invoice PDF. `path` = endpoint API (pembeli atau admin).
 */
export function InvoiceButton({
  path,
  orderNumber,
  label = 'Unduh invoice',
  className = '',
}: {
  path: string;
  orderNumber: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await downloadFile(path, `Invoice-${orderNumber}.pdf`);
    } catch {
      toast.error('Invoice gagal diunduh. Coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4 text-blue-700" />}
      {label}
    </button>
  );
}
