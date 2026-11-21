import type { MetadataRoute } from 'next';
import { API_URL } from '@/lib/server-api';

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');

// Dibangun ulang tiap jam agar buku & artikel baru ikut terdaftar.
export const revalidate = 3600;

type Page<T> = { data: T[]; last_page: number };

/** Ambil semua halaman hasil API berpaginasi (dibatasi agar build tidak menggantung). */
async function fetchAll<T>(path: string, perPage: number): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= 50; page++) {
    try {
      const sep = path.includes('?') ? '&' : '?';
      const res = await fetch(`${API_URL}${path}${sep}per_page=${perPage}&page=${page}`, { next: { revalidate } });
      if (!res.ok) break;
      const json = (await res.json()) as Page<T>;
      out.push(...(json.data ?? []));
      if (page >= (json.last_page ?? 1)) break;
    } catch {
      break;
    }
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [books, posts, categories, bundles] = await Promise.all([
    fetchAll<{ slug: string; updated_at?: string }>('/books?sort=terbaru', 48),
    fetchAll<{ slug: string; published_at?: string; updated_at?: string }>('/posts', 30),
    fetch(`${API_URL}/categories`, { next: { revalidate } })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []) as Promise<{ slug: string; books_count?: number }[]>,
    fetch(`${API_URL}/bundles`, { next: { revalidate } })
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => []) as Promise<{ slug: string }[]>,
  ]);

  const now = new Date();
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${SITE}/`, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${SITE}/buku`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${SITE}/promo`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE}/paket`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${SITE}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${SITE}/syarat-ketentuan`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${SITE}/kebijakan-privasi`, changeFrequency: 'yearly', priority: 0.2 },
  ];

  return [
    ...staticPages,
    ...(Array.isArray(categories) ? categories : [])
      .filter((c) => (c.books_count ?? 1) > 0)
      .map((c) => ({ url: `${SITE}/buku?category=${encodeURIComponent(c.slug)}`, changeFrequency: 'weekly' as const, priority: 0.6 })),
    ...books.map((b) => ({
      url: `${SITE}/buku/${b.slug}`,
      lastModified: b.updated_at ? new Date(b.updated_at) : undefined,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    })),
    ...(Array.isArray(bundles) ? bundles : []).map((b) => ({ url: `${SITE}/paket/${b.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...posts.map((p) => ({
      url: `${SITE}/blog/${p.slug}`,
      lastModified: p.updated_at ? new Date(p.updated_at) : p.published_at ? new Date(p.published_at) : undefined,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    })),
  ];
}
