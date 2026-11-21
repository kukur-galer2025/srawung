'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { Cookie } from 'lucide-react';
import {
  CONSENT_EVENT,
  GA_ID,
  META_PIXEL_ID,
  OPEN_CONSENT_EVENT,
  TRACKERS_ENABLED,
  captureAttribution,
  getConsent,
  setConsent,
} from '@/lib/analytics';

function subscribeConsent(cb: () => void) {
  window.addEventListener(CONSENT_EVENT, cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener(CONSENT_EVENT, cb);
    window.removeEventListener('storage', cb);
  };
}

/**
 * Dipasang sekali di root layout:
 *  - mencatat sumber kunjungan (UTM/referrer) setiap pindah halaman,
 *  - menampilkan banner persetujuan & memuat GA4/Meta Pixel setelah disetujui.
 */
export function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const consent = useSyncExternalStore(subscribeConsent, getConsent, () => 'denied' as const);
  const [forceOpen, setForceOpen] = useState(false);

  useEffect(() => {
    captureAttribution();
  }, [pathname, searchParams]);

  // Footer → "Pengaturan cookie" membuka banner lagi.
  useEffect(() => {
    const open = () => setForceOpen(true);
    window.addEventListener(OPEN_CONSENT_EVENT, open);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, open);
  }, []);

  // Page view saat pindah halaman (SPA).
  useEffect(() => {
    if (consent !== 'granted') return;
    const url = pathname + (searchParams?.toString() ? `?${searchParams}` : '');
    window.gtag?.('event', 'page_view', { page_path: url, page_location: window.location.href, page_title: document.title });
    window.fbq?.('track', 'PageView');
  }, [pathname, searchParams, consent]);

  if (!TRACKERS_ENABLED) return null;
  const isPrivateArea = pathname?.startsWith('/admin') || pathname?.startsWith('/baca/');
  const showBanner = (consent === null || forceOpen) && !isPrivateArea;

  return (
    <>
      {consent === 'granted' && GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_ID}',{send_page_view:false,anonymize_ip:true});`}
          </Script>
        </>
      )}
      {consent === 'granted' && META_PIXEL_ID && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
        </Script>
      )}

      {showBanner && (
        <div role="dialog" aria-live="polite" aria-label="Persetujuan cookie" className="fixed inset-x-3 bottom-3 z-[80] sm:inset-x-auto sm:bottom-5 sm:left-5 sm:max-w-sm">
          <div className="rise rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/15">
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-slate-900">
              <Cookie className="h-5 w-5 text-brand-orange" />
              Cookie analitik
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Kami ingin memakai cookie analitik (Google Analytics &amp; Meta) untuk memahami cara situs dipakai dan meningkatkan layanan. Cookie penting untuk login
              dan keranjang tetap aktif.{' '}
              <Link href="/kebijakan-privasi#cookie" className="font-semibold text-slate-900 underline-offset-2 hover:underline">
                Pelajari
              </Link>
            </p>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setConsent('denied');
                  setForceOpen(false);
                }}
                className="h-10 flex-1 rounded-full border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Tolak
              </button>
              <button
                onClick={() => {
                  setConsent('granted');
                  setForceOpen(false);
                }}
                className="h-10 flex-1 rounded-full bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Terima
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
