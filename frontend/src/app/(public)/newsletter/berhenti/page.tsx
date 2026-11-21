import type { Metadata } from 'next';
import { EmailTokenAction } from '@/components/EmailTokenAction';

export const metadata: Metadata = { title: 'Berhenti berlangganan', robots: { index: false } };

export default function UnsubscribeNewsletterPage() {
  return (
    <EmailTokenAction
      endpoint="/newsletter/unsubscribe"
      params={['token']}
      title="Berhenti berlangganan newsletter?"
      description="Anda tidak akan menerima newsletter lagi. Email transaksi (invoice, status pesanan) tetap dikirim."
      button="Berhenti berlangganan"
      danger
    />
  );
}
