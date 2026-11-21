import Image from 'next/image';
import Link from 'next/link';
import { Clock, Newspaper } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { PostSummary } from '@/lib/types';

const TAG_TONES: Record<string, string> = {
  'Tips Belajar': 'from-blue-600 to-indigo-700',
  'Persiapan Ujian': 'from-emerald-600 to-teal-700',
  'Teknologi & AI': 'from-violet-600 to-fuchsia-700',
};

/** Sampul artikel; bila tidak ada gambar, pakai panel bertipografi sesuai tag. */
export function PostCover({
  post,
  sizes = '(max-width: 768px) 100vw, 400px',
  priority = false,
  showTitle = true,
}: {
  post: PostSummary;
  sizes?: string;
  priority?: boolean;
  /** Di halaman detail judul sudah tampil di atas sampul. */
  showTitle?: boolean;
}) {
  if (post.cover_url) {
    return (
      <Image
        src={post.cover_url}
        alt=""
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover transition duration-1000 ease-luxe group-hover:scale-[1.04]"
        unoptimized={post.cover_url.startsWith('http://localhost') || post.cover_url.startsWith('http://127.0.0.1')}
      />
    );
  }
  const tone = (post.tag && TAG_TONES[post.tag]) || 'from-slate-800 to-slate-950';
  const local = (u: string) => u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1');

  // Tanpa foto: tampilkan sampul buku terkait di atas latar warna tag (bukan panel kosong).
  if (post.book_cover_url) {
    return (
      <div className={`relative flex h-full w-full items-center overflow-hidden bg-linear-to-br ${tone}`}>
        <Image src={post.book_cover_url} alt="" fill sizes={sizes} aria-hidden className="scale-125 object-cover opacity-30 blur-2xl" unoptimized={local(post.book_cover_url)} />
        <div aria-hidden className="absolute inset-0 bg-linear-to-r from-black/45 via-black/15 to-transparent" />
        {showTitle && (
          <p className="relative z-10 line-clamp-3 w-[58%] pl-6 font-display text-lg font-semibold leading-snug tracking-tight text-white drop-shadow sm:pl-8 sm:text-2xl">
            {post.title}
          </p>
        )}
        <div className={`absolute bottom-[-6%] top-[10%] ${showTitle ? 'right-[7%]' : 'left-1/2 -translate-x-1/2'}`}>
          <div className="relative aspect-[3/4.3] h-full rotate-[4deg] overflow-hidden rounded-lg shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)] ring-1 ring-white/20 transition duration-1000 ease-luxe group-hover:rotate-[1deg] group-hover:scale-[1.03]">
            <Image src={post.book_cover_url} alt="" fill sizes="240px" className="object-cover" unoptimized={local(post.book_cover_url)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative flex h-full w-full flex-col justify-between overflow-hidden bg-linear-to-br p-6 text-white ${tone}`}>
      <div aria-hidden className="bg-grid-dark absolute inset-0 opacity-70" />
      <div aria-hidden className="absolute -bottom-16 -right-16 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
      <Newspaper className="relative h-5 w-5 text-white/70" />
      <p className="relative line-clamp-3 font-display text-lg font-semibold leading-snug tracking-tight sm:text-xl">{post.title}</p>
    </div>
  );
}

export function PostCard({ post, featured = false }: { post: PostSummary; featured?: boolean }) {
  return (
    <article className={`group flex flex-col ${featured ? 'lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-8' : ''}`}>
      <Link
        href={`/blog/${post.slug}`}
        tabIndex={-1}
        aria-hidden
        className={`sheen relative block overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-900/5 transition duration-700 ease-luxe group-hover:shadow-[0_30px_60px_-30px_rgba(15,23,42,0.45)] ${featured ? 'aspect-[16/10]' : 'aspect-[16/9]'}`}
      >
        <PostCover post={post} priority={featured} />
      </Link>
      <div className={`flex flex-1 flex-col ${featured ? 'pt-5 lg:justify-center lg:pt-0' : 'pt-4'}`}>
        <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
          {post.tag && <span className="font-semibold uppercase tracking-[0.16em] text-brand-orange">{post.tag}</span>}
          {post.tag && <span aria-hidden>·</span>}
          <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
        </div>
        <Link href={`/blog/${post.slug}`}>
          <h3
            className={`font-display font-semibold leading-snug tracking-tight text-slate-900 transition duration-500 group-hover:text-navy ${
              featured ? 'text-2xl sm:text-3xl' : 'line-clamp-2 text-lg'
            }`}
          >
            {post.title}
          </h3>
        </Link>
        {post.excerpt && (
          <p className={`mt-2 text-sm leading-relaxed text-slate-600 ${featured ? 'line-clamp-4 sm:text-base' : 'line-clamp-2'}`}>{post.excerpt}</p>
        )}
        <p className="mt-auto flex items-center gap-1.5 pt-4 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          {post.reading_minutes} menit baca
        </p>
      </div>
    </article>
  );
}
