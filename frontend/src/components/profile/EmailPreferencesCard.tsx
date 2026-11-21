'use client';

import useSWR from 'swr';
import { BellRing } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/dialog';
import { Card } from '@/components/PageHeader';

interface Prefs {
  newsletter: 'subscribed' | 'pending' | 'unsubscribed' | 'none';
  reminder_emails: boolean;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? 'bg-blue-700' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export function EmailPreferencesCard() {
  const { data, mutate } = useSWR<Prefs>('/profile/email-preferences', (url: string) => api.get(url));

  const update = async (patch: Partial<{ newsletter: boolean; reminder_emails: boolean }>) => {
    try {
      const res = await api.put('/profile/email-preferences', patch);
      await mutate({ newsletter: res.newsletter, reminder_emails: res.reminder_emails }, { revalidate: false });
      if (patch.newsletter && res.newsletter === 'pending') toast.info('Cek email Anda untuk mengonfirmasi langganan.');
      else toast.success('Preferensi email disimpan.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Gagal menyimpan.');
    }
  };

  return (
    <Card className="p-6">
      <h2 className="mb-1 flex items-center gap-2 font-sans text-base font-semibold text-slate-900">
        <BellRing className="h-[18px] w-[18px] text-blue-700" />
        Email dari Srawung
      </h2>
      <p className="mb-5 text-sm text-slate-500">Email transaksi (invoice, status pesanan, keamanan akun) selalu dikirim.</p>
      {!data ? (
        <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <ul className="space-y-4">
          <li className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Newsletter</p>
              <p className="text-sm text-slate-500">
                Buku baru, promo, dan artikel pilihan — beberapa kali sebulan.
                {data.newsletter === 'pending' && <span className="block text-jade-700">Menunggu konfirmasi dari email Anda.</span>}
              </p>
            </div>
            <Toggle label="Newsletter" checked={data.newsletter === 'subscribed' || data.newsletter === 'pending'} onChange={(v) => update({ newsletter: v })} />
          </li>
          <li className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">Pengingat & kabar promo</p>
              <p className="text-sm text-slate-500">Pengingat keranjang yang belum dibayar, ajakan melanjutkan buku yang berhenti dibaca, dan kabar saat buku di wishlist sedang promo.</p>
            </div>
            <Toggle label="Pengingat dan kabar promo" checked={data.reminder_emails} onChange={(v) => update({ reminder_emails: v })} />
          </li>
        </ul>
      )}
    </Card>
  );
}
