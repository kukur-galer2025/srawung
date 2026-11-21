'use client';

/*
 * Analitik Srawung.
 *  1. Atribusi (first-party, tanpa cookie pihak ketiga): sumber kunjungan dari UTM
 *     atau referrer luar disimpan 30 hari di browser, lalu ikut terkirim saat checkout
 *     sehingga laporan admin bisa menampilkan "pesanan dari mana".
 *  2. GA4 & Meta Pixel (opsional): hanya dimuat bila ID-nya diisi di .env DAN
 *     pengunjung menyetujui cookie analitik (UU PDP: dasar pemrosesan = persetujuan).
 */

const ATTR_KEY = 'amania_attr';
const CONSENT_KEY = 'amania_consent';
const ATTR_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const CONSENT_EVENT = 'amania-consent-change';
export const OPEN_CONSENT_EVENT = 'amania-open-consent';

export const GA_ID = process.env.NEXT_PUBLIC_GA_ID || '';
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID || '';
export const TRACKERS_ENABLED = !!(GA_ID || META_PIXEL_ID);

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referrer?: string;
  landing_page?: string;
  ts: number;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage diblokir */
  }
}

export function getAttribution(): Attribution | null {
  const raw = safeGet(ATTR_KEY);
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as Attribution;
    return Date.now() - (a.ts || 0) < ATTR_TTL_MS ? a : null;
  } catch {
    return null;
  }
}

/**
 * Catat sumber kunjungan. Kampanye UTM baru selalu menimpa (last campaign touch);
 * referrer luar hanya dicatat bila belum ada sumber yang masih berlaku.
 */
export function captureAttribution() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const utm = {
    utm_source: url.searchParams.get('utm_source') || undefined,
    utm_medium: url.searchParams.get('utm_medium') || undefined,
    utm_campaign: url.searchParams.get('utm_campaign') || undefined,
  };
  const landing = url.origin + url.pathname;

  if (utm.utm_source) {
    safeSet(ATTR_KEY, JSON.stringify({ ...utm, referrer: externalReferrer(), landing_page: landing, ts: Date.now() }));
    return;
  }

  const ref = externalReferrer();
  if (ref && !getAttribution()) {
    safeSet(ATTR_KEY, JSON.stringify({ referrer: ref, landing_page: landing, ts: Date.now() }));
  }
}

function externalReferrer(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const ref = new URL(document.referrer);
    return ref.host && ref.host !== window.location.host ? ref.origin + ref.pathname : undefined;
  } catch {
    return undefined;
  }
}

/* ---------------- Persetujuan cookie ---------------- */

export type Consent = 'granted' | 'denied' | null;

export function getConsent(): Consent {
  const v = safeGet(CONSENT_KEY);
  return v === 'granted' || v === 'denied' ? v : null;
}

export function setConsent(value: 'granted' | 'denied') {
  safeSet(CONSENT_KEY, value);
  window.dispatchEvent(new Event(CONSENT_EVENT));
}

/* ---------------- Event ---------------- */

type Params = Record<string, unknown>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    fbq?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

const PIXEL_EVENTS: Record<string, string> = {
  view_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  add_to_wishlist: 'AddToWishlist',
  begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'Purchase',
  sign_up: 'CompleteRegistration',
  search: 'Search',
};

/** Kirim event ke GA4 & Meta Pixel (diabaikan bila belum dimuat / belum disetujui). */
export function track(event: string, params: Params = {}) {
  if (typeof window === 'undefined' || getConsent() !== 'granted') return;
  try {
    window.gtag?.('event', event, params);
    const pixel = PIXEL_EVENTS[event];
    if (pixel && window.fbq) {
      const value = typeof params.value === 'number' ? params.value : undefined;
      window.fbq('track', pixel, {
        ...(value !== undefined ? { value, currency: 'IDR' } : {}),
        ...(params.item_id ? { content_ids: [String(params.item_id)], content_type: 'product' } : {}),
        ...(params.item_name ? { content_name: params.item_name } : {}),
      });
    }
  } catch {
    /* analitik tidak boleh mengganggu belanja */
  }
}

/** Format item buku untuk event e-commerce GA4. */
export function bookItem(b: { id: number; title: string; price: number; effective_price?: number; category?: { name: string } | null }) {
  return {
    item_id: String(b.id),
    item_name: b.title,
    item_category: b.category?.name,
    price: b.effective_price ?? b.price,
    quantity: 1,
  };
}
