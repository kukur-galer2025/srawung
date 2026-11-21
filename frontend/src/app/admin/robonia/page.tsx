'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, BookX, MessagesSquare, Smile, ThumbsDown } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/utils';
import { AdminHeader, Panel, PanelHeader, Stat, Tabs } from '@/components/admin/ui';

interface Row {
  id: number;
  question: string;
  answer: string;
  rating: number | null;
  feedback: string | null;
  failed: boolean;
  page_book: string | null;
  tools: string[];
  user: { id: number; name: string } | null;
  created_at: string;
}

interface Report {
  days: number;
  total: number;
  sessions: number;
  logged_in_share: number;
  rated: number;
  satisfaction: number | null;
  failed_rate: number;
  topics: { word: string; count: number }[];
  missing: { query: string; count: number }[];
  tools: Record<string, number>;
  disliked: Row[];
  failures: Row[];
}

const TOOL_LABELS: Record<string, string> = {
  search_books: 'Cari katalog',
  get_book_details: 'Detail buku',
  list_categories: 'Kategori',
  get_promotions: 'Promo',
  search_inside_books: 'Cari isi buku',
  get_my_orders: 'Cek pesanan',
  get_my_library: 'Perpustakaan',
  recommend_for_me: 'Rekomendasi pribadi',
};

/** Laporan mutu Kanca: kepuasan, topik, jawaban gagal / dinilai buruk, buku yang dicari tapi tidak ada. */
export default function RoboNiaReportPage() {
  const [days, setDays] = useState(30);
  const [tab, setTab] = useState<'disliked' | 'failures'>('disliked');
  const { data } = useSWR<Report>(`/admin/assistant-report?days=${days}`, (url: string) => api.get(url));
  const maxTopic = Math.max(1, ...(data?.topics.map((t) => t.count) ?? [1]));
  const tools = Object.entries(data?.tools ?? {});
  const maxTool = Math.max(1, ...tools.map(([, n]) => n));
  const list = data ? (tab === 'disliked' ? data.disliked : data.failures) : [];

  return (
    <>
      <AdminHeader
        title="Laporan Kanca"
        description="Apa yang ditanyakan pengunjung ke Kanca, seberapa puas mereka, dan jawaban mana yang perlu diperbaiki. Log disimpan 90 hari."
        actions={
          <div className="flex gap-1.5">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`h-9 rounded-xl px-3 text-sm font-medium transition ${days === d ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {d} hari
              </button>
            ))}
          </div>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Pertanyaan" value={data ? data.total.toLocaleString('id-ID') : '—'} hint={data ? `${data.sessions} obrolan · ${data.logged_in_share}% pengguna login` : undefined} />
        <Stat label="Kepuasan" value={data?.satisfaction != null ? `${data.satisfaction}%` : '—'} hint={data ? `dari ${data.rated} jawaban yang dinilai` : undefined} />
        <Stat label="Gagal dijawab" value={data ? `${data.failed_rate}%` : '—'} tone={data && data.failed_rate >= 20 ? 'attention' : 'default'} />
        <Stat label="Dinilai 👎" value={data ? String(data.disliked.length) : '—'} hint="20 terbaru ditampilkan di bawah" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Topik yang sering ditanyakan" description="Kata bermakna paling sering muncul di pertanyaan" />
          {data?.topics.length ? (
            <ol className="space-y-2 p-5">
              {data.topics.map((t) => (
                <li key={t.word} className="grid grid-cols-[7rem_1fr_2.5rem] items-center gap-3 text-sm" title={`${t.word}: ${t.count} pertanyaan`}>
                  <span className="truncate font-medium text-slate-800">{t.word}</span>
                  <span className="h-2 rounded-full bg-slate-100">
                    <span className="block h-2 rounded-[4px] bg-violet-600" style={{ width: `${(t.count / maxTopic) * 100}%` }} />
                  </span>
                  <span className="text-right text-xs tabular-nums text-slate-500">{t.count}</span>
                </li>
              ))}
            </ol>
          ) : (
            <Empty icon={MessagesSquare} text="Belum ada pertanyaan pada periode ini." />
          )}
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Buku yang dicari tapi tidak ada" description="Ide judul baru langsung dari pertanyaan pembeli" />
            {data?.missing.length ? (
              <ul className="divide-y divide-slate-100">
                {data.missing.map((m) => (
                  <li key={m.query} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="truncate font-medium text-slate-800">{m.query}</span>
                    <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-rose-700">{m.count}×</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={BookX} text="Semua buku yang dicari tersedia." />
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Kemampuan yang dipakai" description="Seberapa sering tiap alat Kanca dipakai menjawab" />
            {tools.length ? (
              <ul className="space-y-2 p-5">
                {tools.map(([k, n]) => (
                  <li key={k} className="grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-3 text-sm">
                    <span className="truncate text-slate-700">{TOOL_LABELS[k] ?? k}</span>
                    <span className="h-2 rounded-full bg-slate-100">
                      <span className="block h-2 rounded-[4px] bg-violet-600" style={{ width: `${(n / maxTool) * 100}%` }} />
                    </span>
                    <span className="text-right text-xs tabular-nums text-slate-500">{n}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty icon={Smile} text="Belum ada data." />
            )}
          </Panel>
        </div>
      </div>

      <div className="mb-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { id: 'disliked', label: 'Dinilai 👎', count: data?.disliked.length },
            { id: 'failures', label: 'Gagal dijawab', count: data?.failures.length },
          ]}
        />
      </div>
      {list.length ? (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id}>
              <Panel className="p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span>{formatDateTime(r.created_at)}</span>
                  <span>· {r.user ? r.user.name : 'Tamu'}</span>
                  {r.page_book && <span>· di halaman /buku/{r.page_book}</span>}
                  {r.feedback && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">{r.feedback}</span>}
                  {r.failed && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">gagal</span>}
                </div>
                <p className="text-sm font-semibold text-slate-900">{r.question}</p>
                <details className="mt-2 text-sm text-slate-600">
                  <summary className="cursor-pointer text-xs font-semibold text-blue-700">Lihat jawaban Kanca</summary>
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3">{r.answer}</p>
                  {r.tools.length > 0 && <p className="mt-1 text-xs text-slate-400">Alat: {r.tools.map((t) => TOOL_LABELS[t] ?? t).join(', ')}</p>}
                </details>
              </Panel>
            </li>
          ))}
        </ul>
      ) : (
        <Panel>
          <Empty icon={tab === 'disliked' ? ThumbsDown : AlertTriangle} text={tab === 'disliked' ? 'Belum ada jawaban yang dinilai buruk. 🎉' : 'Tidak ada pertanyaan yang gagal dijawab.'} />
        </Panel>
      )}
    </>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ComponentType<{ className?: string }>; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
      <Icon className="h-7 w-7 text-slate-300" />
      <p className="text-sm text-slate-500">{text}</p>
    </div>
  );
}
