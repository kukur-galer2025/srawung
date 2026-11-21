import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BadgePercent,
  BookOpen,
  BookOpenCheck,
  ChevronRight,
  Code2,
  QrCode,
  Eye,
  GraduationCap,
  Library,
  MonitorSmartphone,
  Newspaper,
  Palette,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import { BookCover } from '@/components/BookCard';
import { Price } from '@/components/Price';
import { BannerCarousel } from '@/components/store/BannerCarousel';
import { BookRow, CategoryShelf } from '@/components/store/BookShelf';
import { Countdown } from '@/components/store/Countdown';
import { CouponCard } from '@/components/store/CouponCard';
import { ForYouShelf, RecentlyViewedShelf } from '@/components/store/ForYou';
import { PostCard } from '@/components/store/PostCard';
import { fetchPublic } from '@/lib/server-api';
import { couponValue, resolveCover } from '@/lib/utils';
import type { Banner, BookSummary, Category, Paginated, PostSummary, PublicCoupon } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Srawung — Sinau Bareng, Berkarya Bareng',
  description:
    'Toko buku digital Srawung: panduan pemrograman, AI, desain, dan persiapan ujian. Rekomendasi sesuai minat, promo setiap pekan, pratinjau gratis, akses selamanya.',
};

const CATEGORY_ICONS: Record<string, { icon: LucideIcon; tone: string }> = {
  pemrograman: { icon: Code2, tone: 'bg-blue-50 text-blue-700 ring-blue-100' },
  'teknologi-ai': { icon: Sparkles, tone: 'bg-violet-50 text-violet-700 ring-violet-100' },
  desain: { icon: Palette, tone: 'bg-pink-50 text-pink-700 ring-pink-100' },
  'persiapan-ujian': { icon: GraduationCap, tone: 'bg-emerald-50 text-emerald-700 ring-emerald-100' },
};

const STEPS = [
  { icon: Search, title: 'Pilih buku', body: 'Jelajahi katalog dan baca pratinjau halaman awal secara gratis.' },
  { icon: QrCode, title: 'Bayar via QRIS', body: 'Scan dari m-banking atau e-wallet apa pun, ketik nominal tepat sesuai total.' },
  { icon: Upload, title: 'Unggah bukti', body: 'Kirim tangkapan layar bukti bayar. Tanda terima langsung masuk ke email Anda.' },
  { icon: BookOpenCheck, title: 'Mulai membaca', body: 'Setelah diverifikasi admin, buku aktif di perpustakaan Anda.' },
];

const PERKS = [
  { icon: Eye, title: 'Pratinjau gratis', body: 'Baca halaman awal sebelum membeli' },
  { icon: MonitorSmartphone, title: 'Semua perangkat', body: 'Ponsel, tablet, dan laptop' },
  { icon: Library, title: 'Akses selamanya', body: 'Sekali bayar, tanpa langganan' },
  { icon: ShieldCheck, title: 'Legal & aman', body: 'Konten resmi berlisensi' },
];

const FAQS = [
  {
    q: 'Bagaimana cara membeli buku di Srawung?',
    a: 'Pilih buku, masukkan ke keranjang, lalu checkout. Bayar dengan memindai QRIS Srawung dari aplikasi m-banking atau e-wallet apa pun (GoPay, OVO, DANA, ShopeePay, dan lainnya), bayar sesuai total tagihan, lalu unggah bukti pembayaran di halaman pesanan. Setelah admin memverifikasi, buku langsung aktif di perpustakaan Anda dan konfirmasi dikirim ke email.',
  },
  {
    q: 'Bagaimana Srawung memilih rekomendasi untuk saya?',
    a: 'Rekomendasi disusun dari buku yang Anda lihat dan miliki, topik favorit yang Anda pilih, kemiripan isi antarbuku, serta buku yang sedang diminati pembaca lain. Riwayat lihat untuk tamu hanya disimpan di perangkat Anda dan bisa dihapus kapan saja.',
  },
  {
    q: 'Metode pembayaran apa yang tersedia?',
    a: 'Pembayaran hanya melalui QRIS. Satu kode QRIS bisa dipindai dari semua aplikasi m-banking dan e-wallet yang mendukung QRIS, seperti BCA mobile, Livin by Mandiri, BRImo, GoPay, OVO, DANA, ShopeePay, dan LinkAja.',
  },
  {
    q: 'Apakah buku bisa diunduh atau dibaca offline?',
    a: 'Belum. Buku dibaca melalui fitur pembaca di situs Srawung sehingga membutuhkan koneksi internet. Sebagai gantinya, Anda bisa membaca di perangkat apa pun tanpa memasang aplikasi, dan halaman terakhir tersimpan otomatis.',
  },
  {
    q: 'Berapa lama akses buku setelah dibeli?',
    a: 'Selamanya, selama akun Anda aktif dan mematuhi Syarat & Ketentuan. Tidak ada biaya langganan.',
  },
  {
    q: 'Bagaimana cara memakai kode kupon?',
    a: 'Masukkan kode di kolom kupon pada halaman keranjang sebelum checkout. Kupon yang sedang berlaku bisa Anda lihat dan salin di halaman Promo. Kupon juga bisa digabung dengan harga promo.',
  },
  {
    q: 'Apakah pembelian bisa dibatalkan atau dikembalikan dananya?',
    a: 'Pembelian yang sudah dikonfirmasi tidak dapat dibatalkan, kecuali untuk kondisi tertentu seperti pembayaran ganda atau buku tidak dapat dibaca karena kesalahan di pihak kami. Rinciannya ada di Syarat & Ketentuan.',
  },
];

function SectionHeader({ eyebrow, title, href, linkText }: { eyebrow?: string; title: React.ReactNode; href?: string; linkText?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div>
        {eyebrow && <p className="eyebrow mb-3">{eyebrow}</p>}
        <h2 className="font-display text-3xl font-medium tracking-tight text-slate-900 sm:text-[2.35rem] sm:leading-[1.1]">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="group inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-slate-900">
          <span className="link-underline">{linkText}</span>
          <ArrowUpRight className="h-4 w-4 transition-transform duration-500 ease-luxe group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        </Link>
      )}
    </div>
  );
}

async function getHomeData() {
  const [latest, popular, categories, banners, promo, posts] = await Promise.all([
    fetchPublic<Paginated<BookSummary>>('/books?sort=terbaru&per_page=24', 60),
    fetchPublic<Paginated<BookSummary>>('/books?sort=terlaris&per_page=1', 300),
    fetchPublic<Category[]>('/categories', 300),
    fetchPublic<Banner[]>('/banners', 60),
    fetchPublic<{ books: BookSummary[]; coupons: PublicCoupon[] }>('/promo', 60),
    fetchPublic<Paginated<PostSummary>>('/posts?per_page=3', 120),
  ]);
  return {
    books: latest?.data ?? [],
    total: latest?.total ?? 0,
    featured: popular?.data?.[0] ?? latest?.data?.[0] ?? null,
    categories: (categories ?? []).filter((c) => (c.books_count ?? 1) > 0),
    banners: banners ?? [],
    saleBooks: promo?.books ?? [],
    coupons: promo?.coupons ?? [],
    posts: posts?.data ?? [],
    online: latest !== null,
  };
}

export default async function HomePage() {
  const { books, total, featured, categories, banners, saleBooks, coupons, posts, online } = await getHomeData();

  const saleEnds = saleBooks
    .map((b) => b.sale_ends_at)
    .filter((d): d is string => !!d)
    .sort()[0];
  const maxDiscount = Math.max(0, ...saleBooks.map((b) => b.discount_percent ?? 0));
  const coupon = coupons[0];
  const sidePost = posts[0];

  return (
    <div className="bg-white">
      {/* ===================== BANNER IKLAN ===================== */}
      <section className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8">
        <div className={`grid grid-cols-1 gap-4 ${coupon || sidePost ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <div className="rise min-w-0">
            <BannerCarousel banners={banners} />
          </div>

          {(coupon || sidePost) && (
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1 lg:grid-rows-2">
              {coupon && (
                <Link
                  href="/promo"
                  className="rise delay-2 group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-linear-to-br from-jade-200 via-jade-400 to-jade-600 p-6 text-jade-950 transition duration-700 ease-luxe hover:-translate-y-1 hover:shadow-2xl hover:shadow-jade-500/25 sm:rounded-3xl"
                >
                  <div aria-hidden className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/30 blur-2xl transition duration-700 ease-luxe group-hover:scale-125" />
                  <BadgePercent className="relative h-7 w-7" />
                  <div className="relative mt-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] opacity-80">Kupon pekan ini</p>
                    <p className="mt-1.5 font-display text-[2rem] font-medium leading-none">
                      Hemat <em>{couponValue(coupon)}</em>
                    </p>
                    <p className="mt-2.5 text-sm font-medium">
                      Pakai kode <code className="rounded bg-white/60 px-1.5 py-0.5 font-mono font-bold">{coupon.code}</code>
                    </p>
                  </div>
                  <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-semibold">
                    Lihat semua promo
                    <ArrowRight className="h-4 w-4 transition-transform duration-500 ease-luxe group-hover:translate-x-1" />
                  </span>
                </Link>
              )}
              {sidePost && (
                <Link
                  href={`/blog/${sidePost.slug}`}
                  className="rise delay-3 grain group relative flex flex-col justify-between overflow-hidden rounded-2xl bg-navy p-6 text-white transition duration-700 ease-luxe hover:-translate-y-1 hover:shadow-2xl hover:shadow-navy/30 sm:rounded-3xl"
                >
                  <div aria-hidden className="bg-grid-dark absolute inset-0 opacity-60" />
                  <div aria-hidden className="absolute -bottom-12 -right-12 h-44 w-44 rounded-full bg-brand-orange/30 blur-3xl transition duration-700 ease-luxe group-hover:scale-125" />
                  <span className="relative inline-flex w-fit items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-jade-200">
                    <Newspaper className="h-3.5 w-3.5" />
                    Dari jurnal
                  </span>
                  <p className="relative mt-4 line-clamp-3 font-display text-xl font-medium leading-snug">{sidePost.title}</p>
                  <span className="relative mt-4 inline-flex items-center gap-1 text-sm font-semibold text-jade-200">
                    Baca artikel
                    <ArrowRight className="h-4 w-4 transition-transform duration-500 ease-luxe group-hover:translate-x-1" />
                  </span>
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ===================== IKON KATEGORI ===================== */}
      <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <nav aria-label="Pintasan" className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-4 sm:px-0 lg:grid-cols-7">
          {[
            ...categories.map((c) => ({
              href: `/buku?category=${c.slug}`,
              label: c.name,
              sub: `${c.books_count ?? 0} judul`,
              ...(CATEGORY_ICONS[c.slug] ?? { icon: BookOpen, tone: 'bg-slate-100 text-slate-700 ring-slate-200' }),
            })),
            { href: '/promo', label: 'Promo', sub: saleBooks.length ? `s.d. ${maxDiscount}%` : 'Kupon', icon: BadgePercent, tone: 'bg-rose-50 text-rose-600 ring-rose-100' },
            { href: '/blog', label: 'Jurnal', sub: 'Tips & artikel', icon: Newspaper, tone: 'bg-amber-50 text-jade-700 ring-jade-100' },
            { href: '/buku', label: 'Semua buku', sub: `${total} judul`, icon: Library, tone: 'bg-slate-100 text-slate-700 ring-slate-200' },
          ].map(({ href, label, sub, icon: Icon, tone }, i) => (
            <Link
              key={href}
              href={href}
              style={{ animationDelay: `${0.25 + i * 0.05}s` }}
              className="rise group flex w-32 shrink-0 flex-col items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white px-3 py-4 text-center transition duration-500 ease-luxe hover:-translate-y-1 hover:border-slate-300 hover:shadow-xl hover:shadow-slate-900/[0.06] sm:w-auto"
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ring-inset transition duration-500 ease-luxe group-hover:scale-110 group-hover:rotate-[-4deg] ${tone}`}>
                <Icon className="h-[22px] w-[22px]" />
              </span>
              <span>
                <span className="block text-[13px] font-semibold leading-tight text-slate-900">{label}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{sub}</span>
              </span>
            </Link>
          ))}
        </nav>
      </section>

      {/* ===================== REKOMENDASI PERSONAL ===================== */}
      <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <ForYouShelf />
      </div>

      {/* ===================== PROMO KILAT ===================== */}
      {saleBooks.length > 0 && (
        <section className="reveal mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-3xl bg-linear-to-br from-rose-600 via-rose-500 to-orange-500 p-1.5 shadow-2xl shadow-rose-500/20">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-5 text-white sm:px-7">
              <div className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-inset ring-white/30">
                  <Zap className="h-5 w-5 fill-current" />
                </span>
                <div>
                  <h2 className="font-display text-2xl font-medium tracking-tight sm:text-[1.75rem]">
                    Promo <em>spesial</em>
                  </h2>
                  <p className="text-sm text-white/85">
                    Diskon hingga {maxDiscount}% untuk {saleBooks.length} buku pilihan
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {saleEnds && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/85">Berakhir dalam</span>
                    <Countdown until={saleEnds} />
                  </div>
                )}
                <Link
                  href="/promo"
                  className="group inline-flex h-10 items-center gap-1 rounded-full bg-white px-4 text-sm font-semibold text-rose-600 transition duration-500 ease-luxe hover:bg-rose-50"
                >
                  Lihat semua
                  <ChevronRight className="h-4 w-4 transition-transform duration-500 ease-luxe group-hover:translate-x-0.5" />
                </Link>
              </div>
            </div>
            <div className="rounded-[1.25rem] bg-white px-4 pb-6 pt-6 sm:px-7">
              <BookRow books={saleBooks} />
            </div>
          </div>
        </section>
      )}

      {/* ===================== RIWAYAT ===================== */}
      <div className="mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8 [&:not(:has(section))]:hidden">
        <RecentlyViewedShelf />
      </div>

      {/* ===================== RAK KATEGORI ===================== */}
      <section className="reveal mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Koleksi"
          title={
            <>
              Jelajahi berdasarkan <em className="text-navy">topik</em>
            </>
          }
          href="/buku"
          linkText="Lihat katalog"
        />
        {books.length > 0 ? (
          <CategoryShelf books={books} categories={categories} />
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
            {online ? 'Belum ada buku. Nantikan koleksi pertama kami!' : 'Katalog sedang tidak dapat dimuat. Silakan muat ulang beberapa saat lagi.'}
          </p>
        )}
      </section>

      {/* ===================== KEUNGGULAN ===================== */}
      <section className="reveal mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
        <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 lg:grid-cols-4">
          {PERKS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="group flex flex-col items-start gap-3 bg-white p-4 transition duration-500 ease-luxe hover:bg-slate-50/80 sm:flex-row sm:items-center sm:gap-4 sm:p-6">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy text-jade-300 ring-4 ring-jade-100/60 transition duration-500 ease-luxe group-hover:scale-110 sm:h-11 sm:w-11">
                <Icon className="h-[18px] w-[18px] sm:h-5 sm:w-5" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-base leading-tight font-semibold text-slate-900 sm:text-[17px]">{title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ===================== BUKU PILIHAN ===================== */}
      {featured && (
        <section className="reveal mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
          <div className="grain relative overflow-hidden rounded-3xl bg-navy-deep text-white">
            <div aria-hidden className="bg-grid-dark mask-radial pointer-events-none absolute inset-0" />
            <div aria-hidden className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full bg-blue-600/25 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -bottom-24 right-10 h-80 w-80 rounded-full bg-brand-orange/20 blur-3xl" />

            <div className="relative grid items-center gap-10 p-7 sm:p-10 lg:grid-cols-[1fr_minmax(0,1.3fr)] lg:gap-16 lg:p-16">
              <Link href={`/buku/${featured.slug}`} className="group mx-auto w-full max-w-[240px] lg:max-w-[280px]">
                <div className="sheen drift relative aspect-[3/4.3] overflow-hidden rounded-xl shadow-[0_50px_90px_-25px_rgba(0,0,0,0.85)] ring-1 ring-white/10">
                  <BookCover title={featured.title} srcSet={featured.cover_srcset} placeholder={featured.cover_placeholder} author={featured.author} src={resolveCover(featured.cover_url)} sizes="300px" />
                </div>
              </Link>
              <div>
                <p className="eyebrow mb-5 text-jade-300">Pilihan editor</p>
                <h2 className="font-display text-4xl font-medium leading-[1.08] tracking-tight sm:text-5xl">
                  {featured.title.split(':')[0]}
                  {featured.title.includes(':') && <em className="mt-2 block text-2xl text-jade-200 sm:text-3xl">{featured.title.split(':').slice(1).join(':').trim()}</em>}
                </h2>
                <p className="mt-4 text-sm tracking-wide text-slate-400">
                  {featured.author}
                  {featured.total_pages ? ` · ${featured.total_pages} halaman` : ''}
                  {featured.category ? ` · ${featured.category.name}` : ''}
                </p>
                {featured.synopsis && <p className="mt-6 line-clamp-4 max-w-xl whitespace-pre-line text-[15px] leading-relaxed text-slate-300">{featured.synopsis}</p>}
                <Price book={featured} size="lg" className="mt-7 [&>span:first-child]:!text-white" />
                <Link
                  href={`/buku/${featured.slug}`}
                  className="group mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-navy transition duration-500 ease-luxe hover:gap-3 hover:bg-amber-50"
                >
                  Lihat detail & pratinjau
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ===================== BLOG ===================== */}
      {posts.length > 0 && (
        <section className="reveal mx-auto max-w-7xl px-4 pt-24 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Jurnal Srawung"
            title={
              <>
                Tips & <em className="text-navy">wawasan</em> terbaru
              </>
            }
            href="/blog"
            linkText="Semua artikel"
          />
          <div className="grid gap-x-8 gap-y-12 md:grid-cols-3">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}

      {/* ===================== KUPON ===================== */}
      {coupons.length > 1 && (
        <section className="reveal mx-auto max-w-7xl px-4 pt-16 sm:px-6 lg:px-8">
          <SectionHeader eyebrow="Kupon" title="Kode kupon yang bisa Anda pakai" href="/promo" linkText="Semua kupon" />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {coupons.slice(0, 3).map((c) => (
              <CouponCard key={c.code} coupon={c} />
            ))}
          </div>
        </section>
      )}

      {/* ===================== CARA KERJA ===================== */}
      <section id="cara-kerja" className="mt-24 border-y border-slate-200/80 bg-[#faf8f5] py-20 sm:py-24">
        <div className="reveal mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <p className="eyebrow mb-4">Cara beli</p>
            <h2 className="font-display text-4xl font-medium tracking-tight text-slate-900 sm:text-5xl">
              Empat langkah, lalu <em className="text-navy">mulai membaca</em>
            </h2>
          </div>
          <ol className="relative grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
            <div aria-hidden className="absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-linear-to-r from-transparent via-slate-300 to-transparent lg:block" />
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title} className="reveal-item relative text-center" style={{ '--i': i } as React.CSSProperties}>
                <span className="relative mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-white text-navy shadow-sm ring-1 ring-slate-200">
                  <Icon className="h-6 w-6" />
                  <span className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-brand-orange font-display text-[12px] font-semibold text-white ring-4 ring-[#faf8f5]">
                    {i + 1}
                  </span>
                </span>
                <h3 className="font-display text-xl font-semibold text-slate-900">{title}</h3>
                <p className="mx-auto mt-2 max-w-[16rem] text-sm leading-relaxed text-slate-500">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ===================== FAQ ===================== */}
      <section id="faq" className="reveal mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] lg:gap-20">
          <div>
            <p className="eyebrow mb-4">FAQ</p>
            <h2 className="font-display text-4xl font-medium tracking-tight text-slate-900 sm:text-5xl">
              Pertanyaan yang <em className="text-navy">sering</em> diajukan
            </h2>
            <p className="mt-5 leading-relaxed text-slate-600">
              Belum menemukan jawabannya? Baca{' '}
              <Link href="/syarat-ketentuan" className="link-underline font-semibold text-slate-900">
                Syarat & Ketentuan
              </Link>{' '}
              atau hubungi admin melalui WhatsApp di bagian bawah halaman.
            </p>
          </div>
          <div className="divide-y divide-slate-200 border-y border-slate-200">
            {FAQS.map((f) => (
              <details key={f.q} className="group py-1 [&[open]_.faq-icon]:rotate-45">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 text-left font-display text-lg font-medium text-slate-900 transition duration-300 hover:text-navy [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <span className="faq-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition duration-500 ease-luxe group-hover:border-slate-300">
                    <Plus className="h-4 w-4" />
                  </span>
                </summary>
                <p className="pb-6 pr-12 text-[15px] leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===================== CTA ===================== */}
      <section className="reveal mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <div className="grain relative overflow-hidden rounded-3xl bg-navy px-6 py-16 text-center text-white sm:px-12 sm:py-20">
          <div aria-hidden className="bg-grid-dark mask-radial pointer-events-none absolute inset-0" />
          <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-80 w-[44rem] -translate-x-1/2 rounded-full bg-brand-orange/25 blur-3xl" />
          <div className="relative mx-auto max-w-2xl">
            <p className="eyebrow mb-5 text-jade-300">Gabung gratis</p>
            <h2 className="font-display text-4xl font-medium tracking-tight sm:text-6xl">
              Mulai baca <em className="text-jade-200">hari ini</em>
            </h2>
            <p className="mt-5 text-slate-300">Daftar dalam satu menit, atau masuk cepat dengan akun Google Anda.</p>
            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/daftar"
                className="group inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-[15px] font-semibold text-navy transition duration-500 ease-luxe hover:gap-3 hover:bg-amber-50"
              >
                Daftar gratis
                <ArrowRight className="h-[18px] w-[18px]" />
              </Link>
              <Link
                href="/buku"
                className="inline-flex h-12 items-center justify-center rounded-full border border-white/25 bg-white/5 px-7 text-[15px] font-semibold transition duration-500 ease-luxe hover:bg-white/10"
              >
                Lihat katalog
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
