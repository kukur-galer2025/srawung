'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import {
  ArrowUp,
  BadgePercent,
  BookOpen,
  Bot,
  ClipboardCheck,
  FileSearch,
  Heart,
  Library,
  MessageCircle,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { formatRupiah } from '@/lib/utils';
import { waAdminUrl } from '@/lib/contact';
import { BookCover } from '@/components/BookCard';

interface CardBook {
  title: string;
  slug: string;
  author: string;
  cover_url: string | null;
  price: number;
  effective_price: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  books?: CardBook[];
  error?: boolean;
  /** id log di server — untuk 👍/👎. */
  id?: number | null;
  rating?: 1 | -1;
  feedback?: string;
  /** Sedang dialirkan dari server. */
  streaming?: boolean;
  /** Status alat yang sedang bekerja, mis. "Memeriksa pesanan Anda…". */
  status?: string;
}

const STORAGE_KEY = 'amania_assistant';
const SESSION_KEY = 'amania_assistant_session';
const MAX_CHARS = 600;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
const SUGGESTIONS_GUEST = [
  'Rekomendasi buku pemrograman untuk pemula',
  'Bagaimana cara membeli dan membayar?',
  'Buku mana yang membahas Eloquent?',
  'Ada promo atau kupon apa sekarang?',
];
const SUGGESTIONS_USER = [
  'Bagaimana status pesanan saya?',
  'Saya sudah baca apa saja, lanjut baca apa?',
  'Ada buku di wishlist saya yang sedang promo?',
  'Buku mana yang membahas Eloquent?',
];
const SUGGESTIONS_BOOK = ['Buku ini cocok untuk pemula?', 'Apa saja yang dibahas di buku ini?', 'Ada buku lain yang mirip?', 'Berapa halaman yang bisa dibaca gratis?'];
const DISLIKE_REASONS = ['Kurang tepat', 'Tidak menjawab pertanyaan', 'Info salah', 'Terlalu panjang'];

/** Buka Kanca dari mana saja: window.dispatchEvent(new CustomEvent('robonia:open', { detail: { prompt, title } })). */
export function openRoboNia(detail: { prompt?: string; title?: string } = {}) {
  window.dispatchEvent(new CustomEvent('robonia:open', { detail }));
}

function sessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return 'anon';
  }
}

/** Kirim pertanyaan & baca jawaban yang dialirkan (Server-Sent Events). */
async function streamChat(body: Record<string, unknown>, onEvent: (event: string, data: Record<string, unknown>) => void) {
  let token: string | null = null;
  try {
    token = localStorage.getItem('amania_token');
  } catch {
    /* storage diblokir */
  }
  const res = await fetch(`${API_URL}/assistant/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message || 'Kanca sedang sibuk. Coba lagi sebentar.');
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      if (event && data) onEvent(event, JSON.parse(data));
    }
  }
}
const HIDDEN_PREFIXES = ['/admin', '/kreator', '/baca/'];
const MEMBER_PREFIXES = ['/perpustakaan', '/wishlist', '/pesanan', '/keranjang', '/profil'];
/** Sama dengan varian `chatcard` di globals.css. */
const CARD_QUERY = '(min-width: 40rem) and (min-height: 34rem)';

/** Avatar Kanca di gelembung obrolan. */
function RoboAvatar() {
  return (
    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy-deep text-jade-300">
      <Bot className="h-4 w-4" />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Markdown ringan → elemen React (tanpa HTML mentah = aman dari XSS). */
/* ------------------------------------------------------------------ */

function renderInline(text: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1]) {
      out.push(
        <strong key={`${key}-b${i}`} className="font-semibold text-slate-900">
          {m[1]}
        </strong>
      );
    } else {
      const [label, href] = [m[2], m[3]];
      if (href.startsWith('/') && !href.startsWith('//')) {
        out.push(
          <Link key={`${key}-l${i}`} href={href} className="font-semibold text-blue-700 underline decoration-blue-200 underline-offset-2 hover:decoration-blue-700">
            {label}
          </Link>
        );
      } else if (href.startsWith('https://wa.me/')) {
        out.push(
          <a key={`${key}-l${i}`} href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-700 underline underline-offset-2">
            {label}
          </a>
        );
      } else {
        out.push(label); // tautan luar tidak ditampilkan sebagai link
      }
    }
    last = re.lastIndex;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '');
        const isList = lines.length > 0 && lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="space-y-1.5">
              {lines.map((l, li) => (
                <li key={li} className="flex gap-2">
                  <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-jade-400" />
                  <span>{renderInline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ''), `${bi}-${li}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(l, `${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function BookChip({ book }: { book: CardBook }) {
  const onSale = book.effective_price < book.price;
  return (
    <Link
      href={`/buku/${book.slug}`}
      className="group flex w-[8.75rem] shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:shadow-[0_18px_34px_-20px_rgba(15,23,42,0.55)] hover:ring-jade-300"
    >
      <span className="relative block aspect-[3/4] w-full overflow-hidden bg-slate-100">
        <BookCover title={book.title} src={book.cover_url} sizes="140px" />
        {onSale && (
          <span className="absolute left-0 top-2 rounded-r-md bg-rose-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow">
            -{Math.round((1 - book.effective_price / book.price) * 100)}%
          </span>
        )}
      </span>
      <span className="flex flex-1 flex-col p-2.5">
        <span className="line-clamp-2 text-[12.5px] leading-snug font-semibold text-slate-900 group-hover:text-blue-800">{book.title}</span>
        <span className="mt-auto flex flex-col pt-1.5">
          <span className={`text-[13px] font-bold tabular-nums ${onSale ? 'text-rose-600' : 'text-slate-900'}`}>{formatRupiah(book.effective_price)}</span>
          {onSale && <span className="text-[10.5px] tabular-nums text-slate-400 line-through">{formatRupiah(book.price)}</span>}
        </span>
      </span>
    </Link>
  );
}

/** Salam sesuai jam di perangkat pengguna. */
function greeting(): string {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
}

type Capability = { icon: LucideIcon; title: string; sub: string; prompt: string; tone: string };

const CAP_GUEST: Capability[] = [
  { icon: Sparkles, title: 'Rekomendasi buku', sub: 'sesuai tujuan Anda', prompt: 'Rekomendasikan buku untuk pemula yang ingin belajar pemrograman', tone: 'from-violet-500/15 to-violet-500/5 text-violet-700' },
  { icon: FileSearch, title: 'Cari di isi buku', sub: 'topik & halamannya', prompt: 'Buku mana yang membahas Eloquent?', tone: 'from-sky-500/15 to-sky-500/5 text-sky-700' },
  { icon: ShoppingBag, title: 'Cara membeli', sub: 'bayar QRIS, cepat', prompt: 'Bagaimana cara membeli dan membayar?', tone: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700' },
  { icon: BadgePercent, title: 'Promo hari ini', sub: 'kupon & diskon', prompt: 'Ada promo atau kupon apa sekarang?', tone: 'from-rose-500/15 to-rose-500/5 text-rose-700' },
];
const CAP_USER: Capability[] = [
  { icon: ClipboardCheck, title: 'Cek pesanan', sub: 'status & langkahnya', prompt: 'Bagaimana status pesanan saya?', tone: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700' },
  { icon: Library, title: 'Lanjut baca apa?', sub: 'dari buku Anda', prompt: 'Saya sudah baca apa saja, lanjut baca apa?', tone: 'from-violet-500/15 to-violet-500/5 text-violet-700' },
  { icon: Heart, title: 'Wishlist promo', sub: 'yang sedang diskon', prompt: 'Ada buku di wishlist saya yang sedang promo?', tone: 'from-rose-500/15 to-rose-500/5 text-rose-700' },
  { icon: FileSearch, title: 'Cari di isi buku', sub: 'topik & halamannya', prompt: 'Buku mana yang membahas Eloquent?', tone: 'from-sky-500/15 to-sky-500/5 text-sky-700' },
];
const CAP_BOOK: Capability[] = [
  { icon: Sparkles, title: 'Cocok untuk saya?', sub: 'tingkat & sasaran', prompt: 'Buku ini cocok untuk pemula?', tone: 'from-violet-500/15 to-violet-500/5 text-violet-700' },
  { icon: BookOpen, title: 'Isi bukunya', sub: 'apa yang dipelajari', prompt: 'Apa saja yang dibahas di buku ini?', tone: 'from-sky-500/15 to-sky-500/5 text-sky-700' },
  { icon: Library, title: 'Buku serupa', sub: 'bandingkan pilihan', prompt: 'Ada buku lain yang mirip dengan buku ini?', tone: 'from-emerald-500/15 to-emerald-500/5 text-emerald-700' },
  { icon: BadgePercent, title: 'Harga & promo', sub: 'halaman gratis juga', prompt: 'Berapa harganya, ada promo, dan berapa halaman gratisnya?', tone: 'from-rose-500/15 to-rose-500/5 text-rose-700' },
];

/** Saran lanjutan di bawah jawaban terakhir, disesuaikan isi jawaban. */
function followUps(m: ChatMessage, bookPage: boolean): string[] {
  const t = m.content.toLowerCase();
  if (/pesanan|bukti|pembayaran|qris/.test(t)) return ['Bagaimana cara unggah ulang bukti?', 'Berapa lama verifikasinya?', 'Saya mau bicara dengan admin'];
  if (m.books && m.books.length >= 2) return ['Bandingkan buku-buku ini', 'Mana yang paling cocok untuk pemula?', 'Ada promo untuk buku ini?'];
  if (m.books && m.books.length === 1) return ['Apa saja isi buku ini?', 'Ada buku lain yang mirip?', 'Berapa halaman yang gratis?'];
  if (bookPage) return ['Ada buku lain yang mirip?', 'Buku ini cocok untuk pemula?'];
  return ['Rekomendasikan buku populer', 'Ada promo apa sekarang?'];
}

/* ------------------------------------------------------------------ */

export function AssistantWidget() {
  const pathname = usePathname() || '/';
  const { user } = useAuth();
  const hidden = HIDDEN_PREFIXES.some((p) => pathname.startsWith(p));
  const { data: status } = useSWR<{ enabled: boolean }>(hidden ? null : '/assistant/status', (url: string) => api.get(url), {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [restored, setRestored] = useState(false);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [bookTitle, setBookTitle] = useState<{ slug: string; title: string } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Konteks halaman: di /buku/{slug} Kanca tahu buku apa yang sedang dibuka.
  const bookSlug = /^\/buku\/([^/?#]+)$/.exec(pathname)?.[1] ?? null;
  const pageTitle = bookTitle && bookTitle.slug === bookSlug ? bookTitle.title : null;

  // Pulihkan obrolan dari sessionStorage (per tab) sekali saat pertama dibuka.
  useEffect(() => {
    if (!open || restored) return;
    const t = setTimeout(() => {
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw) setMessages((JSON.parse(raw) as ChatMessage[]).filter((m) => !m.streaming));
      } catch {
        /* storage diblokir */
      }
      setRestored(true);
    }, 0);
    return () => clearTimeout(t);
  }, [open, restored]);

  useEffect(() => {
    if (!restored) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.filter((m) => !m.streaming).slice(-30)));
    } catch {
      /* abaikan */
    }
  }, [messages, restored]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const card = window.matchMedia(CARD_QUERY).matches;
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    // Layar penuh (HP): halaman di belakang tidak ikut tergulir, dan keyboard tidak langsung
    // muncul agar sapaan & contoh pertanyaan tetap terlihat. Kartu (desktop): langsung fokus.
    if (!card) root.style.overflow = 'hidden';
    const t = card ? setTimeout(() => inputRef.current?.focus(), 150) : undefined;
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(t);
      root.style.overflow = prevOverflow;
    };
  }, [open]);

  // Dibuka dari tombol lain (mis. "Tanya Kanca soal buku ini" di halaman buku).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string; title?: string }>).detail ?? {};
      const slug = /^\/buku\/([^/?#]+)$/.exec(window.location.pathname)?.[1];
      if (detail.title && slug) setBookTitle({ slug, title: detail.title });
      setOpen(true);
      if (detail.prompt) setPending(detail.prompt);
    };
    window.addEventListener('robonia:open', onOpen);
    return () => window.removeEventListener('robonia:open', onOpen);
  }, []);

  // Gelembung sapaan di atas tombol: sekali per sesi, setelah beberapa detik, hilang sendiri.
  const [teaser, setTeaser] = useState(false);
  useEffect(() => {
    if (open || hidden || !status?.enabled) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem('amania_robonia_teaser') === '1';
    } catch {
      /* abaikan */
    }
    if (seen) return;
    const show = setTimeout(() => setTeaser(true), 4000);
    const hide = setTimeout(() => setTeaser(false), 16000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [open, hidden, status?.enabled]);
  const dismissTeaser = () => {
    setTeaser(false);
    try {
      sessionStorage.setItem('amania_robonia_teaser', '1');
    } catch {
      /* abaikan */
    }
  };

  const patchLast = (fn: (m: ChatMessage) => ChatMessage) =>
    setMessages((list) => (list.length ? [...list.slice(0, -1), fn(list[list.length - 1])] : list));

  const send = async (text: string) => {
    const question = text.trim().slice(0, MAX_CHARS);
    if (!question || sending) return;
    const history: ChatMessage[] = [...messages.filter((m) => !m.error && !m.streaming), { role: 'user', content: question }];
    setMessages([...history, { role: 'assistant', content: '', streaming: true, status: 'Sebentar…' }]);
    setInput('');
    setSending(true);
    try {
      await streamChat(
        {
          messages: history.slice(-12).map(({ role, content }) => ({ role, content })),
          session_id: sessionId(),
          book_slug: bookSlug,
        },
        (event, data) => {
          if (event === 'status') patchLast((m) => ({ ...m, status: String(data.text ?? '') }));
          else if (event === 'delta') patchLast((m) => ({ ...m, content: m.content + String(data.text ?? ''), status: undefined }));
          else if (event === 'restart') patchLast((m) => ({ ...m, content: '', status: 'Mencoba lagi…' }));
          else if (event === 'done')
            patchLast((m) => ({
              ...m,
              content: String(data.reply ?? m.content),
              books: (data.books as CardBook[]) ?? [],
              id: (data.message_id as number | null) ?? null,
              streaming: false,
              status: undefined,
            }));
          else if (event === 'error') throw new Error(String(data.message ?? 'Kanca sedang sibuk.'));
        }
      );
      patchLast((m) => (m.streaming ? { ...m, streaming: false, status: undefined } : m));
    } catch (err: unknown) {
      patchLast(() => ({ role: 'assistant', content: err instanceof Error ? err.message : 'Kanca sedang sibuk. Coba lagi sebentar.', error: true }));
    } finally {
      setSending(false);
    }
  };

  // Pertanyaan yang dikirim dari luar (event robonia:open) dijalankan setelah panel terbuka.
  useEffect(() => {
    if (!pending || !open || !restored || sending) return;
    const t = setTimeout(() => {
      setPending(null);
      send(pending);
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- send dibuat ulang tiap render
  }, [pending, open, restored, sending]);

  const rate = async (index: number, rating: 1 | -1, feedback?: string) => {
    const msg = messages[index];
    if (!msg?.id) return;
    setMessages((list) => list.map((m, i) => (i === index ? { ...m, rating, feedback: feedback ?? m.feedback } : m)));
    api.post('/assistant/feedback', { message_id: msg.id, session_id: sessionId(), rating, feedback: feedback ?? null }).catch(() => {});
  };

  if (hidden || !status?.enabled) return null;

  const isMember = MEMBER_PREFIXES.some((p) => pathname.startsWith(p));
  // Halaman detail buku/paket punya bar beli tetap di bawah (< lg).
  const hasBuyBar = /^\/(buku|paket)\/[^/]+/.test(pathname);
  const suggestions = bookSlug ? SUGGESTIONS_BOOK : user ? SUGGESTIONS_USER : SUGGESTIONS_GUEST;
  const capabilities = bookSlug ? CAP_BOOK : user ? CAP_USER : CAP_GUEST;
  const firstName = user?.name?.split(' ')[0];
  const lastIndex = messages.length - 1;

  const retry = () => {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUser) return;
    setMessages((m) => m.filter((x) => !x.error).slice(0, -1));
    setTimeout(() => send(lastUser.content), 0);
  };

  return (
    <>
      {/* Tombol pembuka + gelembung sapaan */}
      {!open && (
        <div
          className={`fixed right-4 z-[70] flex flex-col items-end gap-2 sm:right-6 ${
            isMember
              ? 'bottom-[calc(6.25rem+env(safe-area-inset-bottom))] md:bottom-6'
              : hasBuyBar
                ? 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6'
                : 'bottom-[calc(1.25rem+env(safe-area-inset-bottom))] sm:bottom-6'
          }`}
        >
          {teaser && (
            <div className="robo-in relative max-w-[15rem] rounded-2xl rounded-br-md bg-white py-3 pl-4 pr-9 text-sm text-slate-700 shadow-[0_20px_45px_-18px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/5">
              <button
                type="button"
                onClick={() => {
                  dismissTeaser();
                  setOpen(true);
                }}
                className="text-left"
              >
                <span className="block font-semibold text-slate-900">Hai{firstName ? `, ${firstName}` : ''}! 👋</span>
                {bookSlug ? 'Penasaran isi buku ini? Tanya aku saja.' : 'Bingung pilih buku? Tanya aku, aku bantu carikan.'}
              </button>
              <button type="button" onClick={dismissTeaser} aria-label="Tutup sapaan" className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <button
            onClick={() => {
              dismissTeaser();
              setOpen(true);
            }}
            aria-label="Tanya Kanca, asisten buku Srawung"
            title="Tanya Kanca"
            className="group flex items-center gap-2.5 rounded-full bg-navy-deep p-1.5 text-white shadow-[0_18px_40px_-14px_rgba(11,59,49,0.85)] ring-1 ring-white/10 transition hover:-translate-y-0.5 sm:p-2 sm:pr-5"
          >
            <span className="robo-bob relative flex h-11 w-11 items-center justify-center rounded-full bg-linear-to-br from-jade-300 to-brand-orange text-slate-950 sm:h-10 sm:w-10">
              <Bot className="h-[22px] w-[22px] sm:h-5 sm:w-5" />
              <span aria-hidden className="robo-ring absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-navy-deep bg-emerald-400" />
            </span>
            <span className="hidden text-sm font-semibold whitespace-nowrap sm:inline">
              Tanya <span className="text-jade-300">Kanca</span>
            </span>
          </button>
        </div>
      )}

      {/* Panel obrolan */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Kanca, asisten buku Srawung"
          className="robo-panel fixed inset-0 z-[75] flex h-dvh flex-col overflow-hidden overscroll-contain bg-[#f7f6f2] chatcard:inset-auto chatcard:right-6 chatcard:bottom-6 chatcard:h-[min(44rem,calc(100dvh-3rem))] chatcard:w-[25.5rem] chatcard:rounded-[1.75rem] chatcard:shadow-[0_40px_90px_-30px_rgba(2,6,23,0.6)] chatcard:ring-1 chatcard:ring-slate-900/10"
        >
          <header className="relative shrink-0 overflow-hidden bg-navy-deep px-5 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] text-white chatcard:pt-4">
            <div aria-hidden className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full bg-brand-orange/30 blur-3xl" />
            <div aria-hidden className="pointer-events-none absolute -left-10 bottom-0 h-24 w-40 rounded-full bg-indigo-500/20 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-jade-300 to-brand-orange text-slate-950 shadow-[0_8px_20px_-8px_rgba(245,158,11,0.8)]">
                <Bot className="h-5 w-5" />
                <span aria-hidden className="robo-ring absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-navy-deep bg-emerald-400" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-display text-lg leading-tight font-medium">
                  Kanca
                  <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold tracking-wider text-jade-200 ring-1 ring-white/15">AI</span>
                </p>
                <p className="truncate text-xs text-slate-300">Online · siap bantu 24 jam</p>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={() => {
                    setMessages([]);
                    try {
                      sessionStorage.removeItem(SESSION_KEY);
                    } catch {
                      /* abaikan */
                    }
                  }}
                  title="Mulai obrolan baru"
                  aria-label="Mulai obrolan baru"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                aria-label="Tutup Kanca"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white/80 ring-1 ring-white/15 transition hover:bg-white/20 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {bookSlug && (
              <p className="relative mt-3 flex items-center gap-2 rounded-xl bg-white/[0.07] px-3 py-2 text-xs text-slate-200 ring-1 ring-white/10">
                <BookOpen className="h-3.5 w-3.5 shrink-0 text-jade-300" />
                <span className="truncate">
                  Sedang membahas <strong className="font-semibold text-white">{pageTitle ?? 'buku di halaman ini'}</strong>
                </span>
              </p>
            )}
          </header>

          <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-5" aria-live="polite">
            {messages.length === 0 ? (
              /* Sambutan: salam + kartu kemampuan */
              <div className="robo-in">
                <p className="font-display text-[1.65rem] leading-tight font-medium tracking-tight text-slate-900">
                  {greeting()}
                  {firstName ? `, ${firstName}` : ''} <span className="inline-block">👋</span>
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                  {bookSlug
                    ? `Ada yang ingin Anda ketahui tentang ${pageTitle ?? 'buku ini'}?`
                    : user
                      ? 'Saya bisa cek pesanan, progres baca, dan mencarikan bacaan berikutnya.'
                      : 'Saya Kanca. Ceritakan yang Anda cari, saya bantu temukan bukunya.'}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-2.5">
                  {capabilities.map((c, i) => (
                    <button
                      key={c.title}
                      onClick={() => send(c.prompt)}
                      className="robo-in group flex flex-col items-start gap-2 rounded-2xl bg-white p-3.5 text-left ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:shadow-[0_16px_30px_-20px_rgba(15,23,42,0.5)] hover:ring-jade-300"
                      style={{ animationDelay: `${80 + i * 60}ms` }}
                    >
                      <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-linear-to-br ${c.tone}`}>
                        <c.icon className="h-[18px] w-[18px]" />
                      </span>
                      <span>
                        <span className="block text-[13.5px] font-semibold text-slate-900">{c.title}</span>
                        <span className="block text-[11.5px] text-slate-500">{c.sub}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mb-2 mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Atau coba tanyakan</p>
                <div className="flex flex-wrap gap-2">
                  {suggestions.slice(0, 3).map((q) => (
                    <button
                      key={q}
                      onClick={() => send(q)}
                      className="rounded-full bg-white px-3.5 py-2 text-left text-[13px] text-slate-700 ring-1 ring-slate-200 transition hover:bg-amber-50 hover:text-slate-950 hover:ring-jade-300"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m, i) =>
                m.role === 'user' ? (
                  <div key={i} className="robo-in flex justify-end">
                    <div className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-linear-to-br from-navy-deep to-[#175a4a] px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap text-white shadow-[0_10px_24px_-14px_rgba(11,59,49,0.8)]">
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="robo-in flex gap-2.5">
                    <RoboAvatar />
                    <div className="min-w-0 flex-1 space-y-2.5">
                      <div
                        className={`w-fit max-w-full rounded-[1.25rem] rounded-tl-md px-4 py-3 text-sm leading-relaxed ${
                          m.error ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200' : 'bg-white text-slate-700 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.45)] ring-1 ring-slate-200/70'
                        }`}
                      >
                        {m.error ? (
                          m.content
                        ) : m.streaming && !m.content ? (
                          <span className="flex items-center gap-2.5" aria-label="Kanca sedang menyiapkan jawaban">
                            <span className="flex gap-1">
                              {[0, 1, 2].map((d) => (
                                <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-jade-400" style={{ animationDelay: `${d * 140}ms` }} />
                              ))}
                            </span>
                            <span className="robo-shimmer text-xs font-medium">{m.status ?? 'Sebentar…'}</span>
                          </span>
                        ) : (
                          <>
                            <RichText text={m.content} />
                            {m.streaming && <span aria-hidden className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-jade-500" />}
                          </>
                        )}
                        {m.error && i === lastIndex && (
                          <button onClick={retry} className="mt-2 block text-xs font-semibold text-rose-700 underline underline-offset-2">
                            Coba lagi
                          </button>
                        )}
                      </div>
                      {m.books && m.books.length > 0 && (
                        <div className="no-scrollbar -mr-4 flex snap-x gap-2.5 overflow-x-auto pb-1 pr-4">
                          {m.books.map((b) => (
                            <BookChip key={b.slug} book={b} />
                          ))}
                        </div>
                      )}
                      {!m.error && !m.streaming && m.id && (
                        <div className="flex flex-wrap items-center gap-1 pl-1">
                          {!m.rating ? (
                            <>
                              <span className="mr-0.5 text-[11px] text-slate-400">Membantu?</span>
                              <button onClick={() => rate(i, 1)} aria-label="Jawaban membantu" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-emerald-50 hover:text-emerald-600">
                                <ThumbsUp className="h-3.5 w-3.5" />
                              </button>
                              <button onClick={() => rate(i, -1)} aria-label="Jawaban kurang membantu" className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600">
                                <ThumbsDown className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="flex items-center gap-1 text-[11px] text-slate-400">
                              {m.rating === 1 ? <ThumbsUp className="h-3 w-3 text-emerald-600" /> : <ThumbsDown className="h-3 w-3 text-rose-500" />}
                              {m.rating === 1 ? 'Terima kasih!' : m.feedback ? 'Terima kasih, akan kami perbaiki.' : 'Apa yang kurang?'}
                            </span>
                          )}
                          {m.rating === -1 &&
                            !m.feedback &&
                            DISLIKE_REASONS.map((r) => (
                              <button key={r} onClick={() => rate(i, -1, r)} className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-rose-50 hover:text-rose-700 hover:ring-rose-200">
                                {r}
                              </button>
                            ))}
                        </div>
                      )}
                      {/* Saran lanjutan hanya di bawah jawaban terakhir */}
                      {i === lastIndex && !m.error && !m.streaming && !sending && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {followUps(m, !!bookSlug).map((q) =>
                            q === 'Saya mau bicara dengan admin' ? (
                              <a
                                key={q}
                                href={waAdminUrl('Halo Admin Srawung, saya butuh bantuan soal pesanan saya')}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                              >
                                <MessageCircle className="h-3 w-3" />
                                {q}
                              </a>
                            ) : (
                              <button
                                key={q}
                                onClick={() => send(q)}
                                className="rounded-full bg-white px-3 py-1.5 text-[12px] font-medium text-slate-700 ring-1 ring-slate-200 transition hover:bg-amber-50 hover:text-slate-950 hover:ring-jade-300"
                              >
                                {q}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )
              )
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="shrink-0 bg-[#f7f6f2] px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2"
          >
            <div className="flex items-end gap-2 rounded-[1.5rem] bg-white p-1.5 pl-2 shadow-[0_10px_30px_-20px_rgba(15,23,42,0.5)] ring-1 ring-slate-200 transition focus-within:ring-2 focus-within:ring-jade-300">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                rows={1}
                placeholder={bookSlug ? 'Tanya soal buku ini…' : 'Tanya apa saja soal buku…'}
                aria-label="Pertanyaan untuk Kanca"
                className="max-h-28 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-base text-slate-900 outline-none [field-sizing:content] placeholder:text-slate-400 sm:text-sm"
                style={{ outline: 'none' }} // fokus ditandai cincin emas pada wadahnya
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                aria-label="Kirim pertanyaan"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-jade-300 to-brand-orange text-slate-950 shadow-[0_8px_18px_-8px_rgba(245,158,11,0.9)] transition hover:brightness-105 active:scale-95 disabled:from-slate-200 disabled:to-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </div>
            <p className="mt-2 flex items-center justify-between gap-2 px-2 text-[11px] text-slate-400">
              <span className="min-w-0 truncate">Kanca memakai AI dan bisa keliru.</span>
              {input.length > MAX_CHARS - 100 ? (
                <span className="tabular-nums">
                  {input.length}/{MAX_CHARS}
                </span>
              ) : (
                <a href={waAdminUrl('Halo Admin Srawung, saya butuh bantuan')} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 font-medium text-emerald-700 hover:underline">
                  <MessageCircle className="h-3 w-3" />
                  Chat admin
                </a>
              )}
            </p>
          </form>
        </div>
      )}
    </>
  );
}
