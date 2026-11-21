'use client';

import { useState } from 'react';
import { Check, Link2, MessageCircle } from 'lucide-react';

/** Bagikan halaman: WhatsApp & salin tautan (tanpa skrip pelacak pihak ketiga). */
export function ShareButtons({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard diblokir */
    }
  };

  const shareWa = () => {
    const text = encodeURIComponent(`${title} — ${window.location.href}`);
    window.open(`https://wa.me/?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={shareWa}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
      >
        <MessageCircle className="h-4 w-4" />
        WhatsApp
      </button>
      <button
        onClick={copy}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 px-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
        {copied ? 'Tersalin' : 'Salin tautan'}
      </button>
    </div>
  );
}
