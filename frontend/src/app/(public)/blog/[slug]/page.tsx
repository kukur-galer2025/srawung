import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Eye } from 'lucide-react';
import { BookCard } from '@/components/BookCard';
import { PostCard, PostCover } from '@/components/store/PostCard';
import { ShareButtons } from '@/components/store/ShareButtons';
import { API_URL } from '@/lib/server-api';
import { formatDate } from '@/lib/utils';
import type { PostDetail } from '@/lib/types';

interface PageProps {
  params: Promise<{ slug: string }>;
}

async function getPost(slug: string): Promise<PostDetail | null> {
  try {
    // Tanpa cache agar jumlah pembaca bertambah tiap kunjungan.
    const res = await fetch(`${API_URL}/posts/${encodeURIComponent(slug)}`, { cache: 'no-store' });
    return res.ok ? ((await res.json()) as PostDetail) : null;
  } catch {
    return null;
  }
}

async function getPostMeta(slug: string): Promise<PostDetail | null> {
  // Metadata memakai cache supaya tidak menambah hitungan pembaca dua kali.
  try {
    const res = await fetch(`${API_URL}/posts/${encodeURIComponent(slug)}`, { next: { revalidate: 300, tags: [`post-${slug}`] } });
    return res.ok ? ((await res.json()) as PostDetail) : null;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPostMeta(slug);
  if (!post) return { title: 'Artikel tidak ditemukan' };
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      type: 'article',
      publishedTime: post.published_at,
      images: post.cover_url ? [{ url: post.cover_url }] : [],
    },
  };
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.published_at,
    author: { '@type': 'Organization', name: 'Tim Redaksi Srawung' },
    image: post.cover_url ?? undefined,
  };

  return (
    <div className="bg-white pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article>
        <header className="mx-auto max-w-3xl px-4 pt-10 sm:px-6 lg:pt-14">
          <Link href="/blog" className="mb-8 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" />
            Semua artikel
          </Link>
          {post.tag && (
            <Link
              href={`/blog?tag=${encodeURIComponent(post.tag)}`}
              className="eyebrow mb-5 transition hover:opacity-80"
            >
              {post.tag}
            </Link>
          )}
          <h1 className="rise font-display text-4xl font-medium leading-[1.08] tracking-tight text-slate-900 sm:text-[3.25rem]">{post.title}</h1>
          {post.excerpt && <p className="rise delay-1 mt-6 font-display text-xl italic leading-relaxed text-slate-500">{post.excerpt}</p>}

          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-y border-slate-200 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy font-display text-base font-semibold text-jade-300">A</span>
              <div className="text-sm">
                <p className="font-semibold text-slate-900">Tim Redaksi Srawung</p>
                <p className="flex flex-wrap items-center gap-x-2 text-slate-500">
                  <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {post.reading_minutes} menit baca
                  </span>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {post.views.toLocaleString('id-ID')} kali dibaca
                  </span>
                </p>
              </div>
            </div>
            <ShareButtons title={post.title} />
          </div>
        </header>

        {(post.cover_url || post.book_cover_url) && (
          <div className="mx-auto mt-10 max-w-5xl px-4 sm:px-6">
            <div className="relative aspect-[2/1] overflow-hidden rounded-3xl bg-slate-100">
              <PostCover post={post} sizes="(max-width: 1024px) 100vw, 1024px" priority showTitle={false} />
            </div>
          </div>
        )}

        <div className="mx-auto mt-12 grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-8">
          <div className="prose-amania mx-auto w-full max-w-3xl lg:mx-0" dangerouslySetInnerHTML={{ __html: post.body_html }} />

          {post.book && (
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">Buku terkait</p>
                <div className="mx-auto max-w-[200px]">
                  <BookCard {...post.book} />
                </div>
                <Link
                  href={`/buku/${post.book.slug}`}
                  className="mt-5 flex h-11 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  Baca pratinjau gratis
                </Link>
              </div>
            </aside>
          )}
        </div>
      </article>

      {post.related.length > 0 && (
        <section className="mx-auto mt-20 max-w-7xl border-t border-slate-200 px-4 pt-14 sm:px-6 lg:px-8">
          <h2 className="mb-8 font-display text-3xl font-medium tracking-tight text-slate-900">Baca <em className="text-navy">juga</em></h2>
          <div className="grid gap-x-6 gap-y-10 md:grid-cols-3">
            {post.related.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
