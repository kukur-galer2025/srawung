import type { Metadata } from 'next';
import { EmailTokenAction } from '@/components/EmailTokenAction';

export const metadata: Metadata = { title: 'Matikan pengingat', robots: { index: false } };

export default function UnsubscribeRemindersPage() {
  return (
    <EmailTokenAction
      endpoint="/email/reminders/unsubscribe"
      params={['u', 't']}
      title="Matikan pengingat & kabar promo?"
      description="Anda tidak akan menerima pengingat keranjang, pengingat lanjut membaca, dan kabar promo buku di wishlist. Bisa diaktifkan lagi kapan saja di halaman Profil."
      button="Matikan pengingat"
      danger
    />
  );
}
