'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { AlertCircle, ArrowRight, CheckCircle2, Layers, Loader2, Lock, MailWarning, ShoppingBag, Tag, Trash2, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { getAttribution, track } from '@/lib/analytics';
import { toast } from '@/lib/dialog';
import { showFlash } from '@/lib/flash';
import type { CartLine } from '@/lib/types';
import { formatRupiah } from '@/lib/utils';
import { api } from '@/lib/api';
import { BookCover } from '@/components/BookCard';
import { EmptyState } from '@/components/EmptyState';
import { Card, PageHeader } from '@/components/PageHeader';

export default function CartPage() {
  const router = useRouter();
  const { items, bookIds, bundleIds, removeItem, clearCart } = useCart();
  const { user, refresh } = useAuth();
  const unverified = !!user && !user.email_verified_at;
  const [resending, setResending] = useState(false);

  const [couponCode, setCouponCode] = useState('');
  const [coupon, setCoupon] = useState<{ code: string; type: string; value: number; discount: number; creator: string | null } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);


  // Harga final dari server: promo terkini, harga paket, dan buku yang sudah dimiliki.
  const quoteKey = items.length ? ['/cart/quote', bookIds.join(','), bundleIds.join(',')] : null;
  const { data: quote, isLoading: quoting } = useSWR<{ lines: CartLine[]; subtotal: number }>(quoteKey, () =>
    api.post('/cart/quote', { book_ids: bookIds, bundle_ids: bundleIds })
  );

  const lines = quote?.lines ?? [];
  const available = lines.filter((l) => l.available);
  const total = quote?.subtotal ?? 0;
  const savings = available.reduce((sum, l) => sum + Math.max(0, l.normal_price - l.price), 0);

  // Diskon dihitung ulang server-side saat checkout; nilai ini hanya estimasi tampilan.
  // Diskon dari server (voucher kreator hanya memotong buku kreator tsb.); dihitung ulang saat isi keranjang berubah.
  const discount = coupon ? Math.min(coupon.discount, total) : 0;
  const grandTotal = Math.max(0, total - discount);

  const cartKey = `${bookIds.join(',')}|${bundleIds.join(',')}|${total}`;
  useEffect(() => {
    if (!coupon || !quote) return;
    let alive = true;
    api
      .post('/coupons/validate', { code: coupon.code, total, book_ids: bookIds, bundle_ids: bundleIds })
      .then((res) => alive && setCoupon((c) => (c ? { ...c, discount: Number(res.discount) || 0 } : c)))
      .catch((err: unknown) => {
        if (!alive) return;
        setCoupon(null);
        const msg = err instanceof Error ? err.message : 'Kupon tidak berlaku lagi untuk isi keranjang ini.';
        setCouponError(msg);
        showFlash({ tone: 'warning', icon: Tag, title: `Kupon ${coupon.code} dilepas`, description: msg });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey]);

  const resendVerification = async () => {
    setResending(true);
    try {
      await api.post('/auth/email/resend', {});
      toast.success(`Tautan verifikasi dikirim ke ${user?.email}. Cek kotak masuk & folder spam.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengirim ulang tautan.');
    } finally {
      setResending(false);
    }
  };

  const applyCoupon = async (code: string) => {
    code = code.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res = await api.post('/coupons/validate', { code, total, book_ids: bookIds, bundle_ids: bundleIds });
      const applied = { code: res.code ?? code, type: res.type ?? 'fixed', value: Number(res.value) || 0, discount: Number(res.discount) || 0, creator: res.creator ?? null };
      setCoupon(applied);
      setCouponCode('');
      showFlash({
        tone: 'success',
        icon: Tag,
        title: `Kupon ${applied.code.toUpperCase()} dipakai`,
        description: applied.discount > 0 ? `Anda hemat ${formatRupiah(applied.discount)} di pesanan ini.` : 'Diskon diterapkan ke ringkasan pesanan.',
      });
    } catch (err: unknown) {
      setCoupon(null);
      const msg = err instanceof Error ? err.message : 'Kupon tidak valid.';
      setCouponError(msg);
      showFlash({ tone: 'error', icon: Tag, title: 'Kupon tidak bisa dipakai', description: msg });
    } finally {
      setCouponLoading(false);
    }
  };

  const checkout = async () => {
    if (!available.length) return;
    if (unverified) await refresh(); // status mungkin sudah berubah di tab lain
    setCheckoutLoading(true);
    setCheckoutError(null);
    const attr = getAttribution();
    track('begin_checkout', {
      currency: 'IDR',
      value: grandTotal,
      coupon: coupon?.code,
      items: available.map((i) => ({ item_id: `${i.type}-${i.id}`, item_name: i.title, price: i.price, quantity: 1 })),
    });
    try {
      const res = await api.post('/orders', {
        book_ids: available.filter((l) => l.type === 'book').map((l) => l.id),
        bundle_ids: available.filter((l) => l.type === 'bundle').map((l) => l.id),
        coupon_code: coupon?.code,
        attribution: attr
          ? { utm_source: attr.utm_source, utm_medium: attr.utm_medium, utm_campaign: attr.utm_campaign, referrer: attr.referrer, landing_page: attr.landing_page }
          : undefined,
      });
      const orderNumber = res.order?.order_number || res.order_number;
      track('add_payment_info', { currency: 'IDR', value: res.order?.total ?? grandTotal, payment_type: 'QRIS', transaction_id: orderNumber });
      clearCart();
      const free = (res.order?.status ?? '') === 'dikonfirmasi';
      showFlash({
        tone: 'success',
        title: free ? 'Pesanan gratis — buku langsung aktif' : 'Pesanan berhasil dibuat',
        description: free ? `${orderNumber} · buku sudah ada di perpustakaan Anda.` : `${orderNumber} · selesaikan pembayaran QRIS sebelum batas waktu.`,
        duration: 6000,
      });
      router.push(`/pesanan/${orderNumber}/bayar`);
    } catch (err: unknown) {
      setCheckoutError(err instanceof Error ? err.message : 'Gagal membuat pesanan. Silakan coba lagi.');
      setCheckoutLoading(false);
    }
  };

  if (!items.length) {
    return (
      <>
        <PageHeader title="Keranjang" />
        <EmptyState
          icon={<ShoppingBag className="h-7 w-7" />}
          title="Keranjang masih kosong"
          description="Temukan buku yang ingin Anda baca di katalog, atau lihat paket hemat."
          actionText="Jelajahi katalog"
          actionHref="/buku"
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Keranjang" description={`${items.length} item siap dibayar`} />

      {unverified && (
        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Verifikasi email Anda sebelum checkout</p>
              <p className="mt-0.5 leading-relaxed">
                Invoice dan konfirmasi pembayaran dikirim ke <strong className="wrap-anywhere">{user?.email}</strong>. Klik tautan di email verifikasi, lalu kembali ke sini.
                Salah ketik email?{' '}
                <Link href="/profil#email" className="font-semibold underline underline-offset-2">
                  Ganti email
                </Link>
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => refresh()} className="h-10 rounded-full border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-900 transition hover:bg-amber-100">
              Sudah verifikasi
            </button>
            <button
              onClick={resendVerification}
              disabled={resending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-60"
            >
              {resending && <Loader2 className="h-4 w-4 animate-spin" />}
              Kirim ulang tautan
            </button>
          </div>
        </div>
      )}

      {checkoutError && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <AlertCircle className="mt-0.5 h-[18px] w-[18px] shrink-0" />
          {checkoutError}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Card>
            <ul className="divide-y divide-slate-100">
              {(quote ? lines : items.map((i) => ({ ...i, type: i.type ?? 'book', normal_price: i.price, available: true, note: null }) as CartLine)).map((line) => (
                <CartRow key={`${line.type}-${line.id}`} line={line} loading={!quote && quoting} onRemove={() => removeItem(line.id, line.type)} />
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
              <div className="flex gap-4">
                <Link href="/buku" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
                  + Tambah buku
                </Link>
                <Link href="/paket" className="text-sm font-semibold text-blue-700 hover:text-blue-900">
                  Lihat paket hemat
                </Link>
              </div>
              <button onClick={clearCart} className="text-sm text-slate-500 transition hover:text-rose-600">
                Kosongkan
              </button>
            </div>
          </Card>

        </div>

        <Card className="p-6 lg:sticky lg:top-24">
          <h2 className="mb-5 font-sans text-base font-semibold text-slate-900">Ringkasan</h2>

          {coupon ? (
            <div className="mb-5 flex items-center justify-between rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {coupon.code}
                </span>
                {coupon.creator && <span className="mt-0.5 block text-xs text-emerald-700">Voucher {coupon.creator} · berlaku untuk bukunya</span>}
              </span>
              <button onClick={() => { showFlash({ tone: 'info', icon: Tag, title: `Kupon ${coupon.code.toUpperCase()} dilepas`, description: 'Harga kembali tanpa diskon kupon.' }); setCoupon(null); }} aria-label="Lepas kupon" className="rounded-md p-1 hover:bg-emerald-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="mb-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  applyCoupon(couponCode);
                }}
              >
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Kode kupon"
                      aria-label="Kode kupon"
                      className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm font-medium uppercase outline-none placeholder:normal-case placeholder:font-normal focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={couponLoading || !couponCode.trim()}
                    className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
                  >
                    {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pakai'}
                  </button>
                </div>
              </form>
              {couponError && <p className="mt-2 text-xs font-medium text-rose-600">{couponError}</p>}
            </div>
          )}

          <dl className="space-y-2.5 border-t border-slate-100 pt-5 text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal</dt>
              <dd className="font-medium text-slate-900">{quote ? formatRupiah(total) : '…'}</dd>
            </div>
            {savings > 0 && (
              <div className="flex justify-between text-rose-600">
                <dt>Anda hemat</dt>
                <dd className="font-medium">{formatRupiah(savings)}</dd>
              </div>
            )}
            {discount > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Diskon kupon</dt>
                <dd className="font-medium">−{formatRupiah(discount)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-slate-100 pt-3">
              <dt className="font-semibold text-slate-900">Total</dt>
              <dd className="text-2xl font-bold tracking-tight text-slate-900">{quote ? formatRupiah(grandTotal) : '…'}</dd>
            </div>
          </dl>

          <button
            onClick={checkout}
            disabled={checkoutLoading || !quote || available.length === 0 || unverified}
            className="group mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-700 text-[15px] font-semibold text-white shadow-[0_10px_24px_-10px_rgba(29,78,216,0.8)] transition hover:bg-blue-800 disabled:opacity-60"
          >
            {checkoutLoading ? (
              <>
                <Loader2 className="h-[18px] w-[18px] animate-spin" />
                Membuat pesanan…
              </>
            ) : (
              <>
                Lanjut ke pembayaran
                <ArrowRight className="h-[18px] w-[18px] transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            Bayar dengan QRIS setelah checkout
          </p>
        </Card>
      </div>
    </>
  );
}

function CartRow({ line, loading, onRemove }: { line: CartLine; loading: boolean; onRemove: () => void }) {
  const href = line.type === 'bundle' ? `/paket/${line.slug}` : `/buku/${line.slug}`;
  const discounted = line.available && line.normal_price > line.price;

  return (
    <li className={`flex gap-4 p-4 sm:p-5 ${line.available ? '' : 'opacity-70'}`}>
      <Link href={href} className="relative aspect-[3/4.3] w-16 shrink-0 overflow-hidden rounded-lg ring-1 ring-slate-900/5 sm:w-[72px]">
        <BookCover title={line.title} src={line.cover_url} />
        {line.type === 'bundle' && (
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-navy/90 py-0.5 text-[10px] font-semibold text-white">
            <Layers className="h-3 w-3" />
            Paket
          </span>
        )}
      </Link>
      <div className="flex min-w-0 flex-1 flex-col">
        <Link href={href} className="line-clamp-2 font-display font-semibold leading-snug text-slate-900 hover:text-blue-700">
          {line.title}
        </Link>
        <p className="mt-0.5 truncate text-sm text-slate-500">{line.author}</p>

        {line.type === 'bundle' && line.books && (
          <ul className="mt-2 space-y-0.5 text-xs text-slate-500">
            {line.books.map((b) => (
              <li key={b.id} className={`flex items-center gap-1.5 ${b.state === 'included' ? '' : 'line-through decoration-slate-300'}`}>
                <span className={`h-1 w-1 shrink-0 rounded-full ${b.state === 'included' ? 'bg-blue-600' : 'bg-slate-300'}`} />
                <span className="truncate">{b.title}</span>
                {b.state === 'owned' && <span className="shrink-0 no-underline text-emerald-600">· sudah dimiliki</span>}
              </li>
            ))}
          </ul>
        )}

        {line.note && <p className={`mt-2 text-xs font-medium ${line.available ? 'text-amber-700' : 'text-rose-600'}`}>{line.note}</p>}

        {line.available && (
          <p className="mt-auto flex flex-wrap items-baseline gap-x-2 pt-2">
            {loading ? (
              <span className="h-4 w-20 animate-pulse rounded bg-slate-100" />
            ) : (
              <>
                <span className={`font-semibold ${discounted ? 'text-rose-600' : 'text-slate-900'}`}>{formatRupiah(line.price)}</span>
                {discounted && <span className="text-xs text-slate-400 line-through">{formatRupiah(line.normal_price)}</span>}
              </>
            )}
          </p>
        )}
      </div>
      <button
        onClick={onRemove}
        aria-label={`Hapus ${line.title}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center self-start rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
      >
        <Trash2 className="h-[18px] w-[18px]" />
      </button>
    </li>
  );
}
