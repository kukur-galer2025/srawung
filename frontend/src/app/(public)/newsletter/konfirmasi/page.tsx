import type { Metadata } from 'next';
import { EmailTokenAction } from '@/components/EmailTokenAction';

export const metadata: Metadata = { title: 'Konfirmasi newsletter', robots: { index: false } };

export default function ConfirmNewsletterPage() {
  return (
    <EmailTokenAction
      endpoint="/newsletter/confirm"
      params={['token']}
      title="Konfirmasi langganan"
      description="Tekan tombol di bawah untuk mulai menerima kabar buku baru, promo, dan artikel pilihan dari Srawung."
      button="Ya, saya mau berlangganan"
    />
  );
}
