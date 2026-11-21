'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ListTree,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  Moon,
  MonitorSmartphone,
  MoveHorizontal,
  Pencil,
  Search,
  ShieldAlert,
  StickyNote,
  Sun,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { showFlash } from '@/lib/flash';
import { confirmDialog, toast } from '@/lib/dialog';
import type { TocEntry } from '@/lib/types';
import { NextReadCard } from '@/components/store/NextReads';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

type Panel = 'toc' | 'search' | 'bookmarks' | 'notes';

/** Tingkat zoom: 1 = pas layar. Tombol +/− melompat antar-tingkat; Ctrl+scroll/cubit touchpad halus. */
const ZOOM_STEPS = [1, 1.25, 1.5, 1.75, 2, 2.5, 3];
const ZOOM_MAX = ZOOM_STEPS[ZOOM_STEPS.length - 1];
const ZOOM_KEY = 'srawung:reader-zoom';
const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(1, Math.round(z * 100) / 100));
type Theme = 'dark' | 'sepia' | 'light';

interface BookmarkItem {
  id: number;
  page_number: number;
  label: string | null;
  created_at: string;
}
interface NoteItem {
  id: number;
  page_number: number;
  body: string;
  color: string;
  updated_at: string;
}
interface SearchResult {
  page: number;
  snippet: string;
  matches: number;
}

const NOTE_COLORS: Record<string, string> = {
  amber: 'bg-amber-400',
  blue: 'bg-sky-500',
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  violet: 'bg-violet-500',
};

const THEMES: Record<Theme, { page: string; bar: string; panel: string; muted: string; chip: string }> = {
  dark: {
    page: 'bg-slate-950 text-slate-100',
    bar: 'bg-slate-900/90 border-slate-800 text-white',
    panel: 'bg-slate-900 border-slate-800 text-slate-100',
    muted: 'text-slate-400',
    chip: 'bg-white/10 hover:bg-white/15',
  },
  sepia: {
    page: 'bg-[#f5ebd7] text-[#433422]',
    bar: 'bg-[#e9ddc4]/90 border-[#dbcbb0] text-[#3d2f1f]',
    panel: 'bg-[#f1e5cc] border-[#dbcbb0] text-[#3d2f1f]',
    muted: 'text-[#7a6650]',
    chip: 'bg-black/5 hover:bg-black/10',
  },
  light: {
    page: 'bg-slate-100 text-slate-900',
    bar: 'bg-white/90 border-slate-200 text-slate-900',
    panel: 'bg-white border-slate-200 text-slate-900',
    muted: 'text-slate-500',
    chip: 'bg-slate-100 hover:bg-slate-200',
  },
};

/** Sorot kata yang dicari di dalam cuplikan. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-300/70 px-0.5 text-inherit">
            {p}
          </mark>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </>
  );
}

/**
 * Watermark bergerak di atas halaman: nama, email, dan jam yang terus berganti
 * posisi. Tangkapan layar tidak pernah "bersih" dan selalu menunjukkan pemilik
 * akun serta waktunya (bisa dicocokkan dengan log akses).
 */
const SPOTS = [
  { top: '14%', left: '8%' },
  { top: '46%', left: '30%' },
  { top: '78%', left: '12%' },
  { top: '28%', left: '52%' },
  { top: '62%', left: '48%' },
  { top: '88%', left: '40%' },
];

function MovingWatermark({ name, email }: { name: string; email: string }) {
  const [tick, setTick] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 1000);
    const move = setInterval(() => setTick((t) => t + 1), 12000);
    return () => {
      clearInterval(clock);
      clearInterval(move);
    };
  }, []);
  const time = now.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const spot = SPOTS[tick % SPOTS.length];

  // Satu label saja, tipis, berpindah pelan — cukup untuk menandai tangkapan layar tanpa mengganggu bacaan.
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 select-none overflow-hidden">
      <span
        className="absolute rotate-[-18deg] whitespace-nowrap text-[11px] font-semibold tracking-wide text-slate-900/8 transition-all duration-2000 ease-in-out sm:text-[12px]"
        style={{ top: spot.top, left: spot.left }}
      >
        {`${name} · ${email} · ${time}`}
      </span>
    </div>
  );
}

export default function ReaderPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const router = useRouter();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  // Perisai konten: 'focus' = jendela tidak aktif, 'capture' = upaya tangkap layar/cetak terdeteksi.
  const [shield, setShield] = useState<null | 'focus' | 'capture'>(null);
  const shieldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rateLimitedUntil = useRef(0);

  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionNonce, setSessionNonce] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [bookTitle, setBookTitle] = useState('Buku Digital');
  const [loading, setLoading] = useState(true);
  const [loadedPage, setLoadedPage] = useState<number | null>(null);
  const pageLoading = !!sessionToken && loadedPage !== currentPage;
  const [error, setError] = useState<string | null>(null);
  const [replaced, setReplaced] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [inputPage, setInputPage] = useState('1');
  const [scrub, setScrub] = useState<number | null>(null);
  const [theme, setTheme] = useState<Theme>('dark');
  const [panel, setPanel] = useState<Panel | null>(null);
  const t = THEMES[theme];

  /* ---------------- Zoom ---------------- */
  const [zoom, setZoom] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(ZOOM_KEY));
      return saved ? clampZoom(saved) : 1;
    } catch {
      return 1;
    }
  });
  const [aspect, setAspect] = useState(0.707); // lebar ÷ tinggi halaman (A4 sampai gambar dimuat)
  const [box, setBox] = useState({ w: 0, h: 0 }); // ruang baca tanpa padding
  const viewEl = useRef<HTMLDivElement | null>(null);
  const prevZoom = useRef(zoom);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Nilai terbaru untuk listener sentuh yang dipasang sekali (callback ref).
  const zoomNow = useRef(zoom);
  const flipPage = useRef<(dir: 1 | -1) => void>(() => {});
  useEffect(() => {
    zoomNow.current = zoom;
  }, [zoom]);

  const zoomIn = useCallback(() => setZoom((z) => ZOOM_STEPS.find((s) => s > z + 0.01) ?? ZOOM_MAX), []);
  const zoomOut = useCallback(() => setZoom((z) => [...ZOOM_STEPS].reverse().find((s) => s < z - 0.01) ?? 1), []);
  const zoomReset = useCallback(() => setZoom(1), []);

  // Ukur ruang baca (berubah saat jendela diubah / panel dibuka) + Ctrl+scroll untuk zoom.
  const viewRef = useCallback((node: HTMLDivElement | null) => {
    viewEl.current = node;
    if (!node) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      // Pengaman: tinggi "pas layar" tidak pernah melebihi layar, walau area ikut memanjang.
      setBox({ w: Math.floor(width), h: Math.floor(Math.min(height, window.innerHeight - 140)) });
    });
    ro.observe(node);
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return; // scroll biasa = geser halaman
      e.preventDefault(); // cegah zoom seluruh browser
      setZoom((z) => clampZoom(z * Math.exp(-e.deltaY * 0.0025)));
    };
    node.addEventListener('wheel', onWheel, { passive: false });

    // Layar sentuh: cubit dua jari = zoom halaman (bukan seluruh situs);
    // geser kiri/kanan saat 100% = ganti halaman. Saat diperbesar, geser = menggeser halaman.
    let pinch: { d: number; z: number } | null = null;
    let swipe: { x: number; y: number; t: number } | null = null;
    const spread = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinch = { d: spread(e.touches) || 1, z: zoomNow.current };
        swipe = null;
      } else if (e.touches.length === 1) {
        swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (pinch && e.touches.length === 2) {
        e.preventDefault();
        setZoom(clampZoom((pinch.z * spread(e.touches)) / pinch.d));
      }
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinch = null;
      if (swipe && e.touches.length === 0 && zoomNow.current <= 1.01) {
        const end = e.changedTouches[0];
        const dx = end.clientX - swipe.x;
        const dy = end.clientY - swipe.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - swipe.t < 700) {
          flipPage.current(dx < 0 ? 1 : -1);
        }
      }
      if (e.touches.length === 0) swipe = null;
    };
    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd);
    node.addEventListener('touchcancel', onTouchEnd);

    return () => {
      ro.disconnect();
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
      viewEl.current = null;
    };
  }, []);

  // Pertahankan titik tengah tampilan saat zoom berubah, lalu ingat pilihan pembaca.
  useEffect(() => {
    const el = viewEl.current;
    const ratio = zoom / prevZoom.current;
    prevZoom.current = zoom;
    try {
      window.localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
      /* penyimpanan diblokir — abaikan */
    }
    if (!el || ratio === 1) return;
    const cx = el.scrollLeft + el.clientWidth / 2;
    const cy = el.scrollTop + el.clientHeight / 2;
    requestAnimationFrame(() => {
      el.scrollLeft = cx * ratio - el.clientWidth / 2;
      el.scrollTop = cy * ratio - el.clientHeight / 2;
    });
  }, [zoom]);

  // Halaman baru dibuka dari atas.
  useEffect(() => {
    viewEl.current?.scrollTo({ top: 0, left: 0 });
  }, [currentPage]);

  // Geser halaman dengan mouse saat diperbesar (di layar sentuh cukup geser jari).
  const onPanStart = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = viewEl.current;
    if (!el || zoom <= 1 || e.pointerType !== 'mouse' || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPanMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = viewEl.current;
    if (!el || !drag.current) return;
    el.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
    el.scrollTop = drag.current.top - (e.clientY - drag.current.y);
  };
  const onPanEnd = () => {
    drag.current = null;
    setDragging(false);
  };

  // Lebar halaman "pas layar", lalu dikali zoom.
  const fitWidth = box.w > 0 && box.h > 0 ? Math.min(box.w - 2, (box.h - 2) * aspect) : 0;
  // "Pas lebar": zoom yang membuat halaman selebar ruang baca (berguna di layar laptop yang lebar).
  const widthZoom = fitWidth ? clampZoom(Math.floor(((box.w - 4) / fitWidth) * 100) / 100) : 1;

  /* ---------------- Sesi baca ---------------- */
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    api
      .post(`/reader/${slug}/session`, {})
      .then((data) => {
        if (cancelled) return;
        setSessionToken(data.session_token);
        setReplaced(null);
        const total = Number(data.book?.total_pages ?? data.total_pages) || 1;
        setTotalPages(total);
        // ?halaman=N (dari hasil pencarian isi buku) mengalahkan posisi terakhir dibaca.
        const requested = Number(new URLSearchParams(window.location.search).get('halaman'));
        const startPage = Math.min(Math.max(1, requested >= 1 ? requested : data.last_read_page || 1), total);
        setCurrentPage(startPage);
        setInputPage(String(startPage));
        if (data.book?.title) setBookTitle(data.book.title);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Anda belum memiliki akses ke buku ini atau sesi gagal dimulai.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, sessionNonce]);

  /* ---------------- Alat baca (daftar isi, penanda, catatan) ---------------- */
  const fetcher = (url: string) => api.get(url);
  const { data: tocData } = useSWR<{ toc: TocEntry[] }>(sessionToken ? `/reader/${slug}/toc` : null, fetcher, { revalidateOnFocus: false });
  const { data: bookmarks, mutate: mutateBookmarks } = useSWR<BookmarkItem[]>(sessionToken ? `/reader/${slug}/bookmarks` : null, fetcher, {
    revalidateOnFocus: false,
  });
  const { data: notes, mutate: mutateNotes } = useSWR<NoteItem[]>(sessionToken ? `/reader/${slug}/notes` : null, fetcher, { revalidateOnFocus: false });
  const toc = useMemo(() => tocData?.toc ?? [], [tocData]);

  /** Bab yang sedang dibaca = entri bab terakhir yang halamannya ≤ halaman aktif. */
  const currentChapter = useMemo(() => {
    let found: TocEntry | null = null;
    for (const e of toc) {
      if (e.level <= 1 && e.page <= currentPage) found = e;
    }
    return found;
  }, [toc, currentPage]);

  const isBookmarked = (bookmarks ?? []).some((b) => b.page_number === currentPage);
  const notesHere = (notes ?? []).filter((n) => n.page_number === currentPage).length;

  /* ---------------- Muat halaman ---------------- */
  const loadPage = useCallback(
    async (page: number) => {
      if (!sessionToken || !canvasRef.current) return;
      if (Date.now() < rateLimitedUntil.current) {
        setLoadedPage(page);
        return;
      }
      try {
        const response = await fetch(`${API_URL}/reader/${slug}/pages/${page}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          if (response.status === 429) {
            const retry = Number(body.retry_after ?? response.headers.get('Retry-After') ?? 30);
            rateLimitedUntil.current = Date.now() + retry * 1000;
            setPageNotice(`${body.message ?? 'Halaman dibuka terlalu cepat.'} (±${retry} detik)`);
          } else if (response.status === 401) {
            setReplaced(body.message ?? 'Sesi baca berakhir. Muat ulang untuk melanjutkan.');
          } else {
            setPageNotice(body.message ?? 'Halaman gagal dimuat. Coba lagi.');
          }
          setLoadedPage(page);
          return;
        }

        setPageNotice(null);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext('2d');
          if (canvas && ctx) {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            if (img.height) setAspect(img.width / img.height);
          }
          URL.revokeObjectURL(url);
          setLoadedPage(page);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          setLoadedPage(page);
        };
        img.src = url;
      } catch {
        setPageNotice('Koneksi terputus. Periksa internet Anda lalu coba lagi.');
        setLoadedPage(page);
      }
    },
    [sessionToken, slug]
  );

  // Sinkronkan input nomor halaman saat halaman berubah (tanpa setState di effect).
  const [syncedPage, setSyncedPage] = useState(currentPage);
  if (syncedPage !== currentPage) {
    setSyncedPage(currentPage);
    setInputPage(String(currentPage));
  }

  useEffect(() => {
    // loadPage hanya memanggil setState setelah `await fetch` (asinkron) — aman.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sessionToken && currentPage) loadPage(currentPage);
  }, [sessionToken, currentPage, loadPage]);

  // Nonaktifkan klik kanan, seleksi, dan drag di area buku.
  useEffect(() => {
    const prevent = (e: Event) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, [data-allow-select]')) return;
      e.preventDefault();
    };
    document.addEventListener('contextmenu', prevent);
    document.addEventListener('selectstart', prevent);
    document.addEventListener('dragstart', prevent);
    return () => {
      document.removeEventListener('contextmenu', prevent);
      document.removeEventListener('selectstart', prevent);
      document.removeEventListener('dragstart', prevent);
    };
  }, []);

  // Sembunyikan halaman saat jendela kehilangan fokus (mis. Snipping Tool / aplikasi
  // perekam dibuka), dan saat tombol tangkap layar / cetak / simpan ditekan.
  //
  // Penggelapan dibuat INSTAN: kelas `reader-shield` dipasang langsung di <body> di dalam
  // event handler (tanpa menunggu render React), sehingga halaman sudah hitam pada frame
  // berikutnya. Tombol Win/⌘ dan Alt ikut memicunya karena hampir semua pintasan tangkap
  // layar diawali tombol itu (Win+Shift+S, Win+PrtSc, Alt+PrtSc, ⌘+Shift+3/4/5) dan
  // browser menerima tombol pengubahnya sebelum sistem operasi mengambil gambar.
  useEffect(() => {
    const body = document.body;
    let releaseTimer: ReturnType<typeof setTimeout> | null = null;
    const darken = () => {
      body.classList.add('reader-shield');
      if (releaseTimer) clearTimeout(releaseTimer);
    };
    const lighten = (delay: number) => {
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        if (document.hasFocus()) body.classList.remove('reader-shield');
      }, delay);
    };

    const onBlur = () => {
      darken();
      setShield((s) => s ?? 'focus');
    };
    const onFocus = () => {
      lighten(250);
      setShield((s) => (s === 'focus' ? null : s));
    };
    const flashCapture = () => {
      darken();
      lighten(2500);
      setShield('capture');
      if (shieldTimer.current) clearTimeout(shieldTimer.current);
      shieldTimer.current = setTimeout(() => setShield(null), 2500);
      showFlash({
        tone: 'warning',
        icon: ShieldAlert,
        title: 'Tangkapan layar tidak diizinkan',
        description: 'Setiap halaman memuat tanda identitas akun Anda. Penyebaran konten dapat menyebabkan akun diblokir.',
        duration: 6000,
      });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Meta' || e.key === 'OS' || e.key === 'Alt' || e.key === 'PrintScreen') darken();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const blocked =
        e.key === 'PrintScreen' ||
        (mod && (k === 'p' || k === 's')) || // cetak / simpan halaman
        (mod && e.shiftKey && ['s', '3', '4', '5'].includes(k)) || // alat tangkap layar browser / macOS
        (e.metaKey && e.shiftKey && k === 's'); // Windows: Win+Shift+S
      if (blocked) {
        e.preventDefault();
        flashCapture();
      }
    };
    // PrintScreen di Windows sering hanya memicu keyup.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') flashCapture();
      else if (e.key === 'Meta' || e.key === 'OS' || e.key === 'Alt') lighten(900);
    };
    const onBeforePrint = () => flashCapture();

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('beforeprint', onBeforePrint);
    document.body.classList.add('reader-active');
    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('beforeprint', onBeforePrint);
      document.body.classList.remove('reader-active', 'reader-shield');
      if (releaseTimer) clearTimeout(releaseTimer);
      if (shieldTimer.current) clearTimeout(shieldTimer.current);
    };
  }, []);

  // Kosongkan canvas saat tab tidak fokus (perlindungan konten).
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && canvasRef.current) {
        canvasRef.current.getContext('2d')?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      } else if (!document.hidden) {
        loadPage(currentPage);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [currentPage, loadPage]);

  // Simpan progres baca.
  useEffect(() => {
    if (sessionToken && currentPage && slug) {
      const id = setTimeout(() => api.post(`/reader/${slug}/progress`, { page: currentPage }).catch(() => {}), 600);
      return () => clearTimeout(id);
    }
  }, [currentPage, sessionToken, slug]);

  const goToPage = useCallback(
    (page: number) => {
      if (page >= 1 && page <= totalPages) setCurrentPage(page);
    },
    [totalPages]
  );

  useEffect(() => {
    flipPage.current = (dir) => goToPage(currentPage + dir);
  }, [currentPage, goToPage]);

  // Navigasi keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      // Ctrl/⌘ + = − 0 mengatur zoom buku, bukan zoom seluruh browser (seperti PDF.js).
      if ((e.ctrlKey || e.metaKey) && !e.altKey && ['+', '=', '-', '_', '0'].includes(e.key)) {
        e.preventDefault();
        if (e.key === '0') zoomReset();
        else if (e.key === '-' || e.key === '_') zoomOut();
        else zoomIn();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        goToPage(currentPage - 1);
      } else if (e.key === 'Escape') {
        setPanel(null);
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === '+' || e.key === '=') zoomIn();
        else if (e.key === '-' || e.key === '_') zoomOut();
        else if (e.key === '0') zoomReset();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentPage, goToPage, zoomIn, zoomOut, zoomReset]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const toggleBookmark = async () => {
    try {
      const existing = (bookmarks ?? []).find((b) => b.page_number === currentPage);
      if (existing) {
        await api.delete(`/reader/${slug}/bookmarks/${existing.id}`);
        toast.info(`Penanda halaman ${currentPage} dihapus.`);
      } else {
        await api.post(`/reader/${slug}/bookmarks`, { page_number: currentPage, label: currentChapter?.title ?? null });
        toast.success(`Halaman ${currentPage} ditandai.`);
      }
      await mutateBookmarks();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal memperbarui penanda.');
    }
  };

  /* ---------------- Tampilan ---------------- */
  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-slate-950 text-white">
        <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
        <p className="text-sm font-semibold tracking-wide text-slate-300">Mempersiapkan sesi membaca…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-white">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-rose-500/20 text-rose-400">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="mb-2 font-display text-2xl font-medium">Akses membaca dibatasi</h2>
        <p className="mb-6 max-w-md text-sm leading-relaxed text-slate-400">{error}</p>
        <div className="flex gap-3">
          <Link href="/perpustakaan" className="rounded-full bg-slate-800 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-700">
            Ke perpustakaan
          </Link>
          <Link href={`/buku/${slug}`} className="rounded-full bg-white px-5 py-2.5 text-xs font-semibold text-slate-900 hover:bg-amber-50">
            Lihat halaman buku
          </Link>
        </div>
      </div>
    );
  }

  const progressPercent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;
  const shownScrub = scrub ?? currentPage;
  const commitScrub = () => {
    if (scrub !== null) {
      goToPage(scrub);
      setScrub(null);
    }
  };

  const toolButton = (id: Panel, label: string, Icon: React.ComponentType<{ className?: string }>, badge?: number) => (
    <button
      onClick={() => setPanel((p) => (p === id ? null : id))}
      aria-pressed={panel === id}
      title={label}
      className={`relative flex h-9 w-9 items-center justify-center rounded-xl transition ${panel === id ? 'bg-amber-400 text-slate-900' : t.chip}`}
    >
      <Icon className="h-4 w-4" />
      {!!badge && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">{badge}</span>
      )}
    </button>
  );

  return (
    <div ref={containerRef} className={`relative flex h-dvh select-none flex-col overflow-hidden font-sans transition-colors duration-300 ${t.page}`}>
      {/* Bilah atas */}
      <header className={`sticky top-0 z-30 flex items-center justify-between gap-3 border-b px-3 py-2.5 backdrop-blur-md transition-colors sm:px-4 ${t.bar}`}>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <button onClick={() => router.push('/perpustakaan')} className={`flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition ${t.chip}`}>
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Perpustakaan</span>
          </button>
          <div className="min-w-0">
            <h1 className="max-w-[140px] truncate font-display text-sm font-semibold sm:max-w-xs md:max-w-md">{bookTitle}</h1>
            {currentChapter && (
              <p className={`max-w-[140px] truncate text-[11px] sm:max-w-xs md:max-w-md ${t.muted}`}>
                {currentChapter.number ? `Bab ${currentChapter.number} · ` : ''}
                {currentChapter.title}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {toolButton('toc', 'Daftar isi', ListTree)}
          {toolButton('search', 'Cari di buku', Search)}
          <button
            onClick={toggleBookmark}
            aria-pressed={isBookmarked}
            title={isBookmarked ? 'Hapus penanda halaman ini' : 'Tandai halaman ini'}
            className={`flex h-9 w-9 items-center justify-center rounded-xl transition ${isBookmarked ? 'bg-amber-400 text-slate-900' : t.chip}`}
          >
            {isBookmarked ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
          </button>
          {toolButton('notes', 'Catatan', StickyNote, notesHere)}
          <span className="mx-1 hidden h-6 w-px bg-current opacity-15 sm:block" />
          <div className={`hidden items-center rounded-xl p-0.5 sm:flex ${t.chip}`}>
            {(
              [
                ['dark', Moon, 'Mode gelap'],
                ['sepia', BookOpen, 'Mode sepia'],
                ['light', Sun, 'Mode terang'],
              ] as const
            ).map(([key, Icon, label]) => (
              <button
                key={key}
                onClick={() => setTheme(key)}
                title={label}
                className={`rounded-lg p-1.5 transition ${theme === key ? 'bg-amber-400 text-slate-900' : 'opacity-60 hover:opacity-100'}`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>
          <button onClick={toggleFullscreen} title={isFullscreen ? 'Keluar layar penuh' : 'Layar penuh'} className={`hidden h-9 w-9 items-center justify-center rounded-xl transition sm:flex ${t.chip}`}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="relative h-1 w-full bg-black/10">
        <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${progressPercent}%` }} />
      </div>

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {pageLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center space-y-2 bg-black/30 backdrop-blur-[2px]">
            <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
            <p className="text-xs font-semibold text-white drop-shadow">Memuat halaman {currentPage}…</p>
          </div>
        )}
        {pageNotice && !pageLoading && (
          <div className="absolute left-1/2 top-4 z-20 w-[min(92%,28rem)] -translate-x-1/2 rounded-xl bg-slate-900/95 px-4 py-3 text-center text-sm text-white shadow-xl">
            {pageNotice}
            <button onClick={() => loadPage(currentPage)} className="ml-2 font-semibold text-amber-300 underline-offset-2 hover:underline">
              Coba lagi
            </button>
          </div>
        )}

        {/* Kontrol zoom */}
        <div className={`absolute bottom-3 right-3 z-20 flex items-center gap-0.5 rounded-xl border p-1 shadow-lg backdrop-blur-md ${t.bar}`}>
          <button onClick={zoomOut} disabled={zoom <= 1} title="Perkecil (−)" aria-label="Perkecil" className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-current/10 disabled:opacity-30">
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={zoomReset} title="Kembali pas layar (0)" className="min-w-12 rounded-lg px-1.5 py-1 text-xs font-semibold tabular-nums transition hover:bg-current/10">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} disabled={zoom >= ZOOM_MAX} title="Perbesar (+)" aria-label="Perbesar" className="flex h-8 w-8 items-center justify-center rounded-lg transition hover:bg-current/10 disabled:opacity-30">
            <ZoomIn className="h-4 w-4" />
          </button>
          {widthZoom > 1.05 && (
            <>
              <span className="mx-0.5 h-5 w-px bg-current opacity-15" />
              <button
                onClick={() => setZoom((z) => (Math.abs(z - widthZoom) < 0.02 ? 1 : widthZoom))}
                aria-pressed={Math.abs(zoom - widthZoom) < 0.02}
                title={Math.abs(zoom - widthZoom) < 0.02 ? 'Kembali pas halaman' : 'Pas lebar'}
                aria-label="Pas lebar"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${Math.abs(zoom - widthZoom) < 0.02 ? 'bg-amber-400 text-slate-900' : 'hover:bg-current/10'}`}
              >
                <MoveHorizontal className="h-4 w-4" />
              </button>
            </>
          )}
        </div>

        {/* Area halaman */}
        <div
          ref={viewRef}
          onPointerDown={onPanStart}
          onPointerMove={onPanMove}
          onPointerUp={onPanEnd}
          onPointerCancel={onPanEnd}
          onDoubleClick={() => (zoom > 1 ? zoomReset() : setZoom(2))}
          style={{ touchAction: 'pan-x pan-y' }}
          className={`reader-canvas-container relative flex flex-1 overflow-auto p-3 sm:p-6 ${zoom > 1 ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        >
          <div className="reader-page relative m-auto shrink-0 overflow-hidden rounded-lg border border-black/15 bg-white shadow-2xl">
            <canvas
              ref={canvasRef}
              className={`block ${fitWidth ? 'max-w-none' : 'max-w-full'} ${shield ? 'invisible' : ''}`}
              style={
                fitWidth
                  ? { width: Math.round(fitWidth * zoom), height: 'auto' }
                  : { maxHeight: 'calc(100vh - 140px)', width: 'auto', height: 'auto' }
              }
            />
            {user && <MovingWatermark name={user.name} email={user.email} />}
            {shield && (
              <button
                type="button"
                onClick={() => setShield(null)}
                className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/90 p-6 text-center text-white"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
                  {shield === 'capture' ? <ShieldAlert className="h-6 w-6 text-amber-300" /> : <Lock className="h-6 w-6 text-amber-300" />}
                </span>
                <span className="max-w-xs text-sm font-semibold">
                  {shield === 'capture' ? 'Tangkapan layar & cetak dinonaktifkan' : 'Halaman disembunyikan saat jendela tidak aktif'}
                </span>
                <span className="text-xs text-white/60">{shield === 'capture' ? 'Konten dilindungi dan bertanda identitas akun Anda.' : 'Klik di sini untuk melanjutkan membaca.'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Panel alat baca */}
        {panel && (
          <aside
            data-allow-select
            className={`modal-panel absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l shadow-2xl sm:w-[380px] ${t.panel}`}
            aria-label="Alat baca"
          >
            <div className="flex items-center gap-1 border-b border-current/10 p-2">
              {(
                [
                  ['toc', 'Daftar isi'],
                  ['search', 'Cari'],
                  ['bookmarks', 'Penanda'],
                  ['notes', 'Catatan'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setPanel(id)}
                  className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${panel === id ? 'bg-amber-400 text-slate-900' : `${t.muted} hover:opacity-100`}`}
                >
                  {label}
                </button>
              ))}
              <button onClick={() => setPanel(null)} aria-label="Tutup panel" className={`ml-1 flex h-8 w-8 items-center justify-center rounded-lg ${t.chip}`}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {panel === 'toc' && <TocPanel toc={toc} current={currentChapter} muted={t.muted} onGo={(p) => goToPage(p)} />}
              {panel === 'search' && <SearchPanel slug={slug} muted={t.muted} onGo={(p) => goToPage(p)} />}
              {panel === 'bookmarks' && (
                <BookmarksPanel
                  items={bookmarks ?? []}
                  muted={t.muted}
                  chip={t.chip}
                  onGo={(p) => goToPage(p)}
                  onDelete={async (id) => {
                    await api.delete(`/reader/${slug}/bookmarks/${id}`);
                    await mutateBookmarks();
                  }}
                />
              )}
              {panel === 'notes' && (
                <NotesPanel slug={slug} items={notes ?? []} page={currentPage} muted={t.muted} chip={t.chip} onGo={(p) => goToPage(p)} onChanged={() => mutateNotes()} />
              )}
            </div>
          </aside>
        )}
      </div>

      {totalPages > 1 && currentPage >= totalPages && <NextReadCard slug={slug} />}

      {/* Bilah bawah */}
      <footer className={`z-30 flex items-center justify-between gap-3 border-t px-3 py-2.5 backdrop-blur-md transition-colors sm:px-4 ${t.bar}`}>
        <button
          disabled={currentPage <= 1 || pageLoading}
          onClick={() => goToPage(currentPage - 1)}
          className={`flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition disabled:opacity-30 sm:px-4 ${t.chip}`}
        >
          <ChevronLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Sebelumnya</span>
        </button>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const p = parseInt(inputPage, 10);
              if (!isNaN(p) && p >= 1 && p <= totalPages) goToPage(p);
              else setInputPage(String(currentPage));
            }}
            className="flex items-center gap-1"
          >
            <input
              type="text"
              inputMode="numeric"
              value={inputPage}
              onChange={(e) => setInputPage(e.target.value)}
              aria-label="Nomor halaman"
              className="w-12 rounded-lg border border-black/10 bg-black/10 py-1 text-center font-mono text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
            <span className="font-mono text-xs opacity-60">/ {totalPages}</span>
          </form>
          {/* Slider: halaman baru dimuat saat dilepas (tidak membanjiri server saat digeser). */}
          <input
            type="range"
            min={1}
            max={totalPages || 1}
            value={shownScrub}
            onChange={(e) => setScrub(parseInt(e.target.value, 10))}
            onPointerUp={commitScrub}
            onKeyUp={commitScrub}
            onBlur={commitScrub}
            aria-label="Geser ke halaman"
            className="hidden h-1.5 w-full max-w-xs cursor-pointer appearance-none rounded-lg bg-black/20 accent-amber-400 sm:block"
          />
          {scrub !== null && <span className="hidden font-mono text-xs text-amber-400 sm:inline">→ {scrub}</span>}
          <span className="hidden text-[11px] font-semibold opacity-60 md:inline">{progressPercent}%</span>
        </div>

        <button
          disabled={currentPage >= totalPages || pageLoading}
          onClick={() => goToPage(currentPage + 1)}
          className="flex h-10 items-center gap-1.5 rounded-xl bg-amber-400 px-3 text-xs font-semibold text-slate-900 transition hover:bg-amber-300 disabled:opacity-30 sm:px-4"
        >
          <span className="hidden sm:inline">Selanjutnya</span>
          <ChevronRight className="h-4 w-4" />
        </button>
      </footer>

      {/* Sesi baca berakhir (mis. lama tidak aktif) */}
      {replaced && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur">
          <div className="max-w-md rounded-2xl bg-white p-6 text-center text-slate-900 shadow-2xl">
            <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <MonitorSmartphone className="h-6 w-6" />
            </span>
            <h2 className="font-display text-xl font-semibold">Sesi baca berakhir di perangkat ini</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{replaced}</p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Link href="/perpustakaan" className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Ke perpustakaan
              </Link>
              <button
                onClick={() => {
                  setSessionToken(null);
                  setLoadedPage(null);
                  setSessionNonce((n) => n + 1);
                }}
                className="rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Lanjutkan membaca di sini
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* =================== Panel =================== */

function TocPanel({ toc, current, muted, onGo }: { toc: TocEntry[]; current: TocEntry | null; muted: string; onGo: (p: number) => void }) {
  const activeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center' });
  }, []);

  if (!toc.length) {
    return <p className={`p-6 text-center text-sm ${muted}`}>Daftar isi belum tersedia untuk buku ini.</p>;
  }
  return (
    <nav className="p-2">
      {toc.map((e, i) => {
        const active = current && e.page === current.page && e.title === current.title;
        if (e.level === 0) {
          return (
            <p key={i} className={`px-3 pb-1 pt-4 text-[10.5px] font-bold uppercase tracking-[0.18em] ${muted}`}>
              {e.title}
            </p>
          );
        }
        return (
          <button
            key={i}
            ref={active ? activeRef : undefined}
            onClick={() => onGo(e.page)}
            className={`flex w-full items-baseline gap-2 rounded-lg px-3 py-2 text-left transition hover:bg-amber-400/15 ${
              e.level === 2 ? 'pl-9 text-[13px]' : 'text-sm font-semibold'
            } ${active ? 'bg-amber-400/20' : ''}`}
          >
            {e.level === 1 && e.number && <span className="w-6 shrink-0 font-mono text-xs text-amber-500">{e.number}</span>}
            <span className="min-w-0 flex-1">{e.title}</span>
            <span className={`shrink-0 font-mono text-[11px] ${muted}`}>{e.page}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SearchPanel({ slug, muted, onGo }: { slug: string; muted: string; onGo: (p: number) => void }) {
  const [q, setQ] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data, isLoading, error } = useSWR<{ results: SearchResult[]; total: number; truncated: boolean; indexed: boolean }>(
    submitted.length >= 2 ? `/reader/${slug}/search?q=${encodeURIComponent(submitted)}` : null,
    (url: string) => api.get(url),
    { revalidateOnFocus: false }
  );

  return (
    <div className="p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(q.trim());
        }}
        className="relative"
      >
        <Search className={`pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${muted}`} />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari kata atau istilah…"
          className="h-11 w-full rounded-xl border border-current/15 bg-transparent pl-9 pr-3 text-sm outline-none focus:border-amber-400"
        />
      </form>
      <div className="mt-4">
        {isLoading && <Loader2 className={`mx-auto mt-6 h-5 w-5 animate-spin ${muted}`} />}
        {error && <p className="text-sm text-rose-400">{error.message}</p>}
        {data && !data.indexed && <p className={`text-sm ${muted}`}>Teks buku ini belum diindeks sehingga belum bisa dicari.</p>}
        {data && data.indexed && (
          <>
            <p className={`mb-3 text-xs ${muted}`}>
              {data.total ? `${data.total}${data.truncated ? '+' : ''} halaman memuat “${submitted}”` : `Tidak ditemukan “${submitted}”.`}
            </p>
            <ul className="space-y-2">
              {data.results.map((r) => (
                <li key={r.page}>
                  <button onClick={() => onGo(r.page)} className="w-full rounded-xl p-3 text-left transition hover:bg-amber-400/15">
                    <p className="mb-1 text-xs font-semibold text-amber-500">
                      Halaman {r.page}
                      {r.matches > 1 && <span className={`ml-1 font-normal ${muted}`}>· {r.matches}×</span>}
                    </p>
                    <p className="text-[13px] leading-relaxed opacity-90">
                      <Highlight text={r.snippet} query={submitted} />
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        {!submitted && <p className={`text-sm ${muted}`}>Ketik minimal 2 huruf lalu tekan Enter.</p>}
      </div>
    </div>
  );
}

function BookmarksPanel({
  items,
  muted,
  chip,
  onGo,
  onDelete,
}: {
  items: BookmarkItem[];
  muted: string;
  chip: string;
  onGo: (p: number) => void;
  onDelete: (id: number) => Promise<void>;
}) {
  if (!items.length) {
    return (
      <div className="p-6 text-center">
        <Bookmark className={`mx-auto h-7 w-7 ${muted}`} />
        <p className={`mt-3 text-sm ${muted}`}>Belum ada penanda. Tekan ikon penanda di bilah atas untuk menandai halaman.</p>
      </div>
    );
  }
  return (
    <ul className="space-y-1 p-2">
      {items.map((b) => (
        <li key={b.id} className="group flex items-center gap-2 rounded-xl px-3 py-2.5 transition hover:bg-amber-400/15">
          <button onClick={() => onGo(b.page_number)} className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold">Halaman {b.page_number}</p>
            {b.label && <p className={`truncate text-xs ${muted}`}>{b.label}</p>}
          </button>
          <button
            onClick={() => onDelete(b.id).catch(() => toast.error('Gagal menghapus penanda.'))}
            aria-label="Hapus penanda"
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-60 transition hover:opacity-100 ${chip}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function NotesPanel({
  slug,
  items,
  page,
  muted,
  chip,
  onGo,
  onChanged,
}: {
  slug: string;
  items: NoteItem[];
  page: number;
  muted: string;
  chip: string;
  onGo: (p: number) => void;
  onChanged: () => void;
}) {
  const [body, setBody] = useState('');
  const [color, setColor] = useState('amber');
  const [editing, setEditing] = useState<NoteItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [onlyHere, setOnlyHere] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/reader/${slug}/notes/${editing.id}`, { page_number: editing.page_number, body, color });
      } else {
        await api.post(`/reader/${slug}/notes`, { page_number: page, body, color });
      }
      setBody('');
      setEditing(null);
      onChanged();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan catatan.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (n: NoteItem) => {
    const ok = await confirmDialog({ title: 'Hapus catatan ini?', confirmText: 'Hapus', tone: 'danger' });
    if (!ok) return;
    try {
      await api.delete(`/reader/${slug}/notes/${n.id}`);
      onChanged();
    } catch {
      toast.error('Gagal menghapus catatan.');
    }
  };

  const list = onlyHere ? items.filter((n) => n.page_number === page) : items;

  return (
    <div className="p-4">
      <form onSubmit={save} className="rounded-xl border border-current/15 p-3">
        <p className={`mb-2 text-xs font-semibold ${muted}`}>{editing ? `Ubah catatan · halaman ${editing.page_number}` : `Catatan untuk halaman ${page}`}</p>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Tulis ringkasan, pertanyaan, atau ide…"
          className="w-full resize-none rounded-lg border border-current/10 bg-transparent p-2.5 text-sm outline-none focus:border-amber-400"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Warna catatan">
            {Object.entries(NOTE_COLORS).map(([key, cls]) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={color === key}
                aria-label={key}
                onClick={() => setColor(key)}
                className={`h-5 w-5 rounded-full ${cls} ${color === key ? 'ring-2 ring-current ring-offset-2 ring-offset-transparent' : 'opacity-70'}`}
              />
            ))}
          </div>
          <div className="flex gap-1.5">
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setBody('');
                }}
                className={`h-8 rounded-lg px-3 text-xs font-semibold ${chip}`}
              >
                Batal
              </button>
            )}
            <button type="submit" disabled={saving || !body.trim()} className="h-8 rounded-lg bg-amber-400 px-3 text-xs font-semibold text-slate-900 disabled:opacity-40">
              {saving ? 'Menyimpan…' : editing ? 'Simpan' : 'Tambah'}
            </button>
          </div>
        </div>
      </form>

      <label className={`mt-4 flex cursor-pointer items-center gap-2 text-xs ${muted}`}>
        <input type="checkbox" checked={onlyHere} onChange={(e) => setOnlyHere(e.target.checked)} className="accent-amber-400" />
        Hanya halaman ini
      </label>

      <ul className="mt-3 space-y-2">
        {list.length === 0 && <p className={`py-4 text-center text-sm ${muted}`}>Belum ada catatan.</p>}
        {list.map((n) => (
          <li key={n.id} className="rounded-xl border border-current/10 p-3">
            <div className="flex items-center justify-between gap-2">
              <button onClick={() => onGo(n.page_number)} className="flex items-center gap-2 text-xs font-semibold text-amber-500 hover:underline">
                <span className={`h-2.5 w-2.5 rounded-full ${NOTE_COLORS[n.color] ?? NOTE_COLORS.amber}`} />
                Halaman {n.page_number}
              </button>
              <div className="flex gap-1">
                <button
                  onClick={() => {
                    setEditing(n);
                    setBody(n.body);
                    setColor(n.color);
                  }}
                  aria-label="Ubah catatan"
                  className={`flex h-7 w-7 items-center justify-center rounded-md opacity-60 hover:opacity-100 ${chip}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => remove(n)} aria-label="Hapus catatan" className={`flex h-7 w-7 items-center justify-center rounded-md opacity-60 hover:opacity-100 ${chip}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{n.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
