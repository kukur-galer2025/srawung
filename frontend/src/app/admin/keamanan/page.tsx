'use client';

import { AdminHeader } from '@/components/admin/ui';
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings';

export default function AdminSecurityPage() {
  return (
    <>
      <AdminHeader title="Keamanan akun" description="Lindungi akun admin: siapa pun yang menguasainya bisa mengganti QRIS pembayaran dan mengonfirmasi pesanan." />
      <TwoFactorSettings />
    </>
  );
}
