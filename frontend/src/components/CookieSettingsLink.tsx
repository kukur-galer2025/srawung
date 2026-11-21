'use client';

import { OPEN_CONSENT_EVENT, TRACKERS_ENABLED } from '@/lib/analytics';

/** Membuka ulang banner persetujuan cookie (hanya tampil bila GA/Pixel dikonfigurasi). */
export function CookieSettingsLink({ className = '' }: { className?: string }) {
  if (!TRACKERS_ENABLED) return null;
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))} className={className}>
      Pengaturan cookie
    </button>
  );
}
