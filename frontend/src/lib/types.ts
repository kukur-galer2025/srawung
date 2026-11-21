/** Bentuk data buku dari API publik (/books, /promo, /posts). */
export interface BookSummary {
  id: number;
  title: string;
  slug: string;
  author: string;
  price: number;
  /** Harga yang dibayar saat ini (harga promo bila berlaku). */
  effective_price?: number;
  sale_price?: number | null;
  sale_ends_at?: string | null;
  is_on_sale?: boolean;
  discount_percent?: number;
  cover_url: string | null;
  /** Varian WebP kecil untuk <img srcset> (null bila belum dibuat). */
  cover_srcset?: string | null;
  /** Placeholder buram mini (data URI) yang tampil seketika. */
  cover_placeholder?: string | null;
  synopsis?: string;
  total_pages?: number;
  rating_avg?: number;
  rating_count?: number;
  updated_at?: string;
  category?: { name: string; slug: string } | null;
}

export interface Review {
  id: number;
  rating: number;
  title: string | null;
  body: string | null;
  author: string;
  is_mine: boolean;
  created_at: string;
  updated_at: string;
}

export interface ReviewPage {
  summary: { average: number; count: number; distribution: Record<string, number> };
  data: Review[];
  current_page: number;
  last_page: number;
  total: number;
}

export interface TocEntry {
  title: string;
  page: number;
  level: 0 | 1 | 2;
  number?: string;
}

export interface Category {
  id: number;
  name: string;
  slug: string;
  books_count?: number;
}

export interface Banner {
  id: number;
  eyebrow: string | null;
  title: string;
  subtitle: string | null;
  cta_label: string | null;
  link_url: string | null;
  image_url: string | null;
  theme: string;
}

export interface PublicCoupon {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  description: string | null;
  expires_at: string | null;
  remaining: number | null;
}

export interface PostSummary {
  id: number;
  title: string;
  slug: string;
  tag: string | null;
  excerpt: string | null;
  /** Foto sampul: unggahan admin, atau gambar pertama di isi artikel. */
  cover_url: string | null;
  cover_source?: 'upload' | 'body' | 'book' | null;
  /** Cadangan bila tidak ada foto: sampul buku terkait. */
  book_cover_url?: string | null;
  published_at: string;
  reading_minutes: number;
  views: number;
  author?: { id: number; name: string } | null;
}

export interface PostDetail extends PostSummary {
  body_html: string;
  book: BookSummary | null;
  related: PostSummary[];
}

export interface Paginated<T> {
  data: T[];
  current_page: number;
  last_page: number;
  total: number;
  /** Hanya pada GET /books?search=… — corrected berisi kueri hasil koreksi salah ketik. */
  search?: { query: string; corrected: string | null };
}

/** Paket hemat (GET /bundles). */
export interface BundleSummary {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  price: number;
  /** Total harga bila buku dibeli satuan (harga promo saat ini). */
  individual_total: number;
  savings: number;
  savings_percent: number;
  ends_at: string | null;
  book_count: number;
  books: { id: number; title: string; slug: string; author: string; cover_url: string | null; price: number; effective_price: number }[];
}

/** Baris keranjang hasil hitung server (POST /cart/quote, GET /cart). */
export interface CartLine {
  type: 'book' | 'bundle';
  id: number;
  title: string;
  slug: string;
  author: string;
  cover_url: string | null;
  price: number;
  normal_price: number;
  on_sale?: boolean;
  owned?: boolean;
  available: boolean;
  note: string | null;
  books?: { id: number; title: string; slug: string; cover_url: string | null; state: 'included' | 'owned' | 'duplicate'; price: number }[];
}
