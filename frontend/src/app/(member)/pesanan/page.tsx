'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, BookOpen, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime, formatRupiah } from '@/lib/utils';
import { EmptyState } from '@/components/EmptyState';
import { Pagination } from '@/components/Pagination';
import { BookCover } from '@/components/BookCard';
import { Card, PageHeader } from '@/components/PageHeader';
import { OrderStatusBadge } from '@/components/OrderStatus';
import { Skeleton } from '@/components/LoadingSkeleton';
import { InvoiceButton } from '@/components/InvoiceButton';

interface Order {
  id: number;
  order_number: string;
  total: number;
  status: 'menunggu_pembayaran' | 'menunggu_verifikasi' | 'dikonfirmasi' | 'ditolak' | 'kedaluwarsa' | 'dikembalikan';
  created_at: string;
  order_items: { id: number; price: number; book: { title: string; slug: string; cover_url: string | null } | null }[];
}

const TABS = [
  { id: 'all', label: 'Semua' },
  { id: 'menunggu_pembayaran', label: 'Belum bayar' },
  { id: 'menunggu_verifikasi', label: 'Diverifikasi' },
  { id: 'dikonfirmasi', label: 'Selesai' },
  { id: 'ditolak', label: 'Ditolak' },
];

export default function OrderHistoryPage() {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<{ data: Order[]; last_page: number; total: number }>(`/orders?page=${page}`, (url: string) => api.get(url));

  const orders = data?.data ?? [];
  const shown = tab === 'all' ? orders : orders.filter((o) => o.status === tab);

  return (
    <>
      <PageHeader title="Pesanan" description="Status pembayaran dan riwayat pembelian Anda." />

      <div className="no-scrollbar mb-6 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="space-y-4 p-6">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-12 w-2/3" />
            </Card>
          ))}
        </div>
      ) : shown.length ? (
        <div className="space-y-4">
          {shown.map((order) => {
            const items = order.order_items ?? [];
            const needsAction = order.status === 'menunggu_pembayaran' || order.status === 'ditolak';
            return (
              <Card key={order.id} className="overflow-hidden transition hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Package className="h-4 w-4 text-slate-400" />
                    <span className="font-mono font-medium text-slate-700">{order.order_number}</span>
                    <span className="hidden text-slate-400 sm:inline">· {formatDateTime(order.created_at)}</span>
                  </div>
                  <span className="flex items-center gap-2">
                    <OrderStatusBadge status={order.status} />
                  </span>
                </div>

                <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
                  <div className="flex -space-x-3">
                    {items.slice(0, 3).map((it) => (
                      <span key={it.id} className="relative aspect-[3/4.3] w-12 overflow-hidden rounded-md shadow-md ring-2 ring-white">
                        <BookCover title={it.book?.title ?? 'Buku'} src={it.book?.cover_url ?? null} />
                      </span>
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 font-semibold text-slate-900">{items[0]?.book?.title ?? 'Pesanan buku'}</p>
                    <p className="text-sm text-slate-500">
                      {items.length > 1 ? `+${items.length - 1} buku lainnya · ` : ''}
                      Total <span className="font-semibold text-slate-900">{formatRupiah(order.total)}</span>
                    </p>
                  </div>
                  {order.status === 'dikonfirmasi' ? (
                    <div className="flex gap-2">
                    <InvoiceButton path={`/orders/${encodeURIComponent(order.order_number)}/invoice`} orderNumber={order.order_number} label="Invoice" />
                    <Link
                      href="/perpustakaan"
                      className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white transition hover:bg-emerald-700"
                    >
                      <BookOpen className="h-4 w-4" />
                      Baca
                    </Link>
                    </div>
                  ) : (
                    <Link
                      href={`/pesanan/${order.order_number}/bayar`}
                      className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition ${
                        needsAction ? 'bg-blue-700 text-white hover:bg-blue-800' : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {order.status === 'ditolak' ? 'Unggah ulang bukti' : needsAction ? 'Bayar sekarang' : 'Lihat detail'}
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="h-7 w-7" />}
          title={tab === 'all' ? 'Belum ada pesanan' : 'Tidak ada pesanan di sini'}
          description={tab === 'all' ? 'Pesanan yang Anda buat akan muncul di halaman ini.' : 'Coba pilih tab lain.'}
          actionText={tab === 'all' ? 'Mulai belanja' : undefined}
          actionHref="/buku"
        />
      )}

      <Pagination currentPage={page} totalPages={data?.last_page ?? 1} onPageChange={setPage} />
    </>
  );
}
