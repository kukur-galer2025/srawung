'use client';

import { AdminHeader } from '@/components/admin/ui';
import { TwoFactorSettings } from '@/components/auth/TwoFactorSettings';

export default function CreatorSecurityPage() {
  return (
    <>
      <AdminHeader title="Keamanan akun" description="Lindungi saldo dan rekening pencairan Anda." />
      <TwoFactorSettings />
    </>
  );
}
