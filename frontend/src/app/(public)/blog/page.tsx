import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PostCard } from '@/components/store/PostCard';
import { fetchPublic } from '@/lib/server-api';
import type { Paginated, PostSummary } from '@/lib/types';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Tips belajar pemrograman, strategi persiapan ujian, dan panduan teknologi dari tim redaksi Srawung.',
};

interface PageProps {
  searchParams: Promise<{ tag?: string; page?: string }>;
}

export default async function BlogPage({ searchParams }: PageProps) {
  const { tag = '', page: pageParam = '1' } = await searchParams;
  const page = Math.max(1, parseInt(pageParam, 10) || 1);

  const qs = new URLSearchParams({ per_page: '9', page: String(page) });
  if (tag) qs.set('tag', tag);
  const res = await fetchPublic<Paginated<PostSummary> & { tags: string[] }>(`/posts?${qs}`, 60);

  const posts = res?.data ?? [];
  const tags = res?.tags ?? [];
  const lastPage = res?.last_page ?? 1;
  const showFeatured = page === 1 && !tag && posts.length > 2;
  const [first, ...rest] = posts;

  const href = (p: number) => {
    const q = new URLSearchParams();
    if (tag) q.set('tag', tag);
    if (p > 1) q.set('page', String(p));
    const s = q.toString();
    return s ? `/blog?${s}` : '/blog';
  };

  return (
    <div className="bg-white pb-20">
      <section className="border-b border-slate-200 bg-[#faf8f5]">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <p className="eyebrow rise mb-5">
            Jurnal Srawung
          </p>
          <h1 className="rise delay-1 max-w-3xl font-display text-5xl font-medium leading-[1.04] tracking-tight text-slate-900 sm:text-6xl">
            Tips, panduan & wawasan untuk <em className="text-navy">terus bertumbuh</em>
          </h1>
          <p className="rise delay-2 mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">Ditulis tim redaksi Amania Press: belajar pemrograman, memanfaatkan AI, hingga strategi lolos ujian.</p>

          {tags.length > 0 && (
            <div className="no-scrollbar -mx-4 mt-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              {['', ...tags].map((t) => {
                const active = tag === t;
                return (
                  <Link
                    key={t || 'semua'}
                    href={t ? `/blog?tag=${encodeURIComponent(t)}` : '/blog'}
                    className={`h-9 shrink-0 rounded-full px-4 text-sm font-semibold leading-9 transition ${
                      active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:text-slate-900'
                    }`}
                  >
                    {t || 'Semua'}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 lg:px-8">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
            <p className="font-semibold text-slate-900">{res ? 'Belum ada artikel di sini' : 'Artikel gagal dimuat'}</p>
            <p className="mt-1 text-sm text-slate-500">{res ? 'Artikel baru segera hadir.' : 'Silakan muat ulang beberapa saat lagi.'}</p>
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
            {showFeatured ? (
              <>
                <div className="md:col-span-2 lg:col-span-3">
                  <PostCard post={first} featured />
                </div>
                {rest.map((p) => (
                  <PostCard key={p.id} post={p} />
                ))}
              </>
            ) : (
              posts.map((p) => <PostCard key={p.id} post={p} />)
            )}
          </div>
        )}

        {lastPage > 1 && (
          <nav aria-label="Halaman" className="mt-14 flex items-center justify-center gap-3">
            {page > 1 ? (
              <Link href={href(page - 1)} className="inline-flex h-10 items-center gap-1 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <ChevronLeft className="h-4 w-4" />
                Sebelumnya
              </Link>
            ) : null}
            <span className="text-sm text-slate-500">
              Halaman {page} dari {lastPage}
            </span>
            {page < lastPage ? (
              <Link href={href(page + 1)} className="inline-flex h-10 items-center gap-1 rounded-full border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Berikutnya
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : null}
          </nav>
        )}
      </div>
    </div>
  );
}
