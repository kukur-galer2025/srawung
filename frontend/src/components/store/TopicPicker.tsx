'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Check, Loader2, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { setGuestTopics, useGuestTopics } from '@/lib/reader-prefs';
import type { Category } from '@/lib/types';

/**
 * Pemilih topik favorit. Login → disimpan di akun; tamu → disimpan di browser.
 * Dipakai mesin rekomendasi sebagai sinyal minat eksplisit.
 */
export function TopicPicker({ onSaved, compact = false }: { onSaved?: (ids: number[]) => void; compact?: boolean }) {
  const { user } = useAuth();
  const guestTopics = useGuestTopics();
  const { data: categories } = useSWR<Category[]>('/categories', (url: string) => api.get(url));
  const { data: saved, mutate } = useSWR<{ category_ids: number[] }>(user ? '/profile/preferences' : null, (url: string) => api.get(url));

  const current = user ? saved?.category_ids : guestTopics;
  const [draft, setDraft] = useState<number[] | null>(null);
  const selected = draft ?? current ?? [];
  const [saving, setSaving] = useState(false);

  const list = (Array.isArray(categories) ? categories : []).filter((c) => (c.books_count ?? 1) > 0);
  const toggle = (id: number) => setDraft((d) => {
    const base = d ?? current ?? [];
    return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
  });
  const dirty = draft !== null && JSON.stringify([...draft].sort()) !== JSON.stringify([...(current ?? [])].sort());

  const save = async () => {
    setSaving(true);
    try {
      if (user) {
        await api.put('/profile/preferences', { category_ids: selected });
        await mutate({ category_ids: selected }, { revalidate: false });
      } else {
        setGuestTopics(selected);
      }
      setDraft(null);
      toast.success(selected.length ? 'Topik favorit disimpan. Rekomendasi diperbarui.' : 'Topik favorit dikosongkan.');
      onSaved?.(selected);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan topik.');
    } finally {
      setSaving(false);
    }
  };

  if (!list.length) return null;

  return (
    <div>
      {!compact && (
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-jade-500" />
          <p className="text-sm font-semibold text-slate-900">Topik apa yang ingin Anda pelajari?</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {list.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => toggle(c.id)}
              aria-pressed={on}
              className={`inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition duration-300 ease-[cubic-bezier(.22,1,.36,1)] ${
                on ? 'bg-navy text-white shadow-md shadow-navy/20' : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:ring-slate-400'
              }`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full transition ${on ? 'bg-brand-orange' : 'ring-1 ring-inset ring-slate-300'}`}>
                {on && <Check className="h-3 w-3 stroke-[3] text-white" />}
              </span>
              {c.name}
            </button>
          );
        })}
      </div>
      {(dirty || saving) && (
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-4 inline-flex h-10 items-center gap-2 rounded-full bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Simpan & perbarui rekomendasi
        </button>
      )}
    </div>
  );
}
