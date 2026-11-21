import { Badge } from '@/components/Badge';

const MAP: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'danger' | 'default' }> = {
  menunggu_pembayaran: { label: 'Menunggu pembayaran', variant: 'warning' },
  menunggu_verifikasi: { label: 'Menunggu verifikasi', variant: 'info' },
  dikonfirmasi: { label: 'Dikonfirmasi', variant: 'success' },
  ditolak: { label: 'Ditolak', variant: 'danger' },
  kedaluwarsa: { label: 'Kedaluwarsa', variant: 'default' },
  dikembalikan: { label: 'Dana dikembalikan', variant: 'default' },
};

export function orderStatusLabel(status: string) {
  return MAP[status]?.label ?? status;
}

export function OrderStatusBadge({ status }: { status: string }) {
  const s = MAP[status] ?? { label: status, variant: 'default' as const };
  return (
    <Badge variant={s.variant} dot>
      {s.label}
    </Badge>
  );
}
