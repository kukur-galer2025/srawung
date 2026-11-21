export interface CreatorBalance {
  earned: number;
  gross: number;
  commission: number;
  /** Pendapatan yang dikoreksi karena refund. */
  reversed: number;
  paid: number;
  pending: number;
  available: number;
  /** Saldo minus (refund setelah saldo ditarik) — terpotong dari penjualan berikutnya. */
  debt: number;
}

export interface CreatorProfileData {
  display_name: string;
  bio: string | null;
  commission_percent: number | null;
  payout_method: 'bank' | 'ewallet' | null;
  payout_provider: string | null;
  payout_account: string | null;
  payout_holder: string | null;
}

export interface CreatorEarningRow {
  id: number;
  gross: number;
  commission_percent: number;
  commission: number;
  net: number;
  reversed_at: string | null;
  reversal_reason: string | null;
  created_at: string;
  book: { id: number; title: string; slug: string } | null;
  order: { id: number; order_number: string; confirmed_at: string | null } | null;
}

export interface CreatorSummary {
  profile: CreatorProfileData | null;
  commission_percent: number;
  min_payout: number;
  /** Biaya admin per penarikan (dipotong dari jumlah yang ditarik). */
  payout_fee: number;
  terms: { version: string; accepted_version: string | null; accepted_at: string | null; needs_acceptance: boolean };
  balance: CreatorBalance;
  month: { sold: number; net: number };
  books: { id: number; title: string; slug: string; status: string; cover_url: string | null; price: number; processing_status: string | null; sold: number; net: number }[];
  recent: CreatorEarningRow[];
}

export interface PayoutRow {
  id: number;
  /** Jumlah yang ditarik dari saldo. */
  amount: number;
  /** Biaya admin. */
  fee: number;
  /** Yang ditransfer ke kreator = amount − fee. */
  net_amount: number | null;
  status: 'requested' | 'paid' | 'rejected';
  payout_method: string;
  payout_provider: string;
  payout_account: string;
  payout_holder: string;
  reference: string | null;
  note: string | null;
  has_proof: boolean;
  processed_at: string | null;
  created_at: string;
  creator?: { id: number; name: string; email: string; creator_profile?: { display_name: string } | null };
}

export const PAYOUT_STATUS: Record<PayoutRow['status'], { label: string; variant: 'warning' | 'success' | 'danger' }> = {
  requested: { label: 'Diproses admin', variant: 'warning' },
  paid: { label: 'Sudah ditransfer', variant: 'success' },
  rejected: { label: 'Ditolak', variant: 'danger' },
};
