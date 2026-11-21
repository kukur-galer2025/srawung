'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, BookPlus, Ticket } from 'lucide-react';
import { api } from '@/lib/api';
import type { CreatorSummary } from '@/lib/creator';
import { formatDateTime, formatRupiah } from '@/lib/utils';
import { AdminHeader, Panel, PanelHeader, Stat, Table, td, th } from '@/components/admin/ui';
import { Badge } from '@/components/Badge';
import { BookCover } from '@/components/BookCard';

export default function CreatorHomePage() {
  const { data } = useSWR<CreatorSummary>('/creator/summary', (url: string) => api.get(url));
  const name = data?.profile?.display_name;

  return (
    <>
      <AdminHeader
        title={name ? `Halo, ${name}` : 'Studio kreator'}
        description={
          data
            ? `Anda menerima ${100 - data.commission_percent}% dari setiap penjualan buku Anda (komisi Srawung ${data.commission_percent}%). Saldo bisa ditarik mulai ${formatRupiah(data.min_payout)} (biaya admin ${formatRupiah(data.payout_fee)} per penarikan).`
            : 'Memuat…'
        }
        actions={
          <>
            <Link href="/kreator/voucher" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-[13.5px] font-medium text-slate-700 hover:bg-slate-50">
              <Ticket className="h-4 w-4" />
              Buat voucher
            </Link>
            <Link href="/kreator/buku" className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-[13.5px] font-medium text-white hover:bg-slate-800">
              <BookPlus className="h-4 w-4" />
              Tambah buku
            </Link>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Saldo bisa ditarik" value={data ? formatRupiah(data.balance.available) : '—'} hint={<Link href="/kreator/pendapatan" className="font-medium text-violet-700 hover:underline">Tarik saldo →</Link>} />
        <Stat label="Terjual bulan ini" value={data ? `${data.month.sold} buku` : '—'} hint={data ? `${formatRupiah(data.month.net)} untuk Anda` : undefined} />
        <Stat label="Total pendapatan" value={data ? formatRupiah(data.balance.earned) : '—'} hint="Setelah komisi" />
        <Stat label="Sudah ditransfer" value={data ? formatRupiah(data.balance.paid) : '—'} hint={data?.balance.pending ? `${formatRupiah(data.balance.pending)} sedang diproses` : undefined} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Panel className="overflow-hidden">
          <PanelHeader title="Buku saya" description="Urut dari pendapatan tertinggi" actions={<Link href="/kreator/buku" className="text-[13px] font-medium text-slate-600 hover:text-slate-900">Kelola →</Link>} />
          {data && data.books.length === 0 ? (
            <div className="p-8 text-center">
              <p className="font-medium text-slate-900">Belum ada buku</p>
              <p className="mt-1 text-sm text-slate-500">Unggah naskah PDF Anda — sistem mengubahnya menjadi halaman yang aman dibaca (ada watermark pembeli).</p>
              <Link href="/kreator/buku" className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 text-[13.5px] font-medium text-white">
                Unggah buku pertama <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(data?.books ?? []).map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="relative aspect-[3/4.3] w-9 shrink-0 overflow-hidden rounded ring-1 ring-slate-900/5">
                    <BookCover title={b.title} src={b.cover_url} sizes="40px" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{b.title}</p>
                    <p className="text-xs text-slate-500">
                      {b.status === 'published' ? (b.processing_status === 'done' ? 'Tayang' : 'Menunggu PDF diproses') : 'Draf'} · {formatRupiah(b.price)}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold tabular-nums text-slate-900">{formatRupiah(b.net)}</p>
                    <p className="text-xs text-slate-500">{b.sold} terjual</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader title="Penjualan terbaru" />
          <Table
            colSpan={2}
            loading={!data}
            empty={!!data && data.recent.length === 0}
            emptyText="Belum ada penjualan."
            head={
              <tr>
                <th className={th}>Buku</th>
                <th className={`${th} text-right`}>Untuk Anda</th>
              </tr>
            }
          >
            {data?.recent.map((e) => (
              <tr key={e.id}>
                <td className={td}>
                  <p className="line-clamp-1 font-medium text-slate-900">{e.book?.title ?? 'Buku'}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(e.created_at)}</p>
                </td>
                <td className={`${td} text-right`}>
                  <p className="font-semibold tabular-nums text-slate-900">{formatRupiah(e.net)}</p>
                  {e.gross > 0 && <Badge>{formatRupiah(e.gross)} − {e.commission_percent}%</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        </Panel>
      </div>
    </>
  );
}
