/**
 * Domain types for the Wallet / MemoCoins system.
 */

export interface WalletData {
  balance: number;
  transactions: WalletTransaction[];
}

export interface WalletTransaction {
  id: string;
  amount: number;
  type: 'credit' | 'debit';
  description: string;
  created_at: string;
}

export interface CreatorTierData {
  tier: number;
  tierName: string;
  tierBadge: string;
  fee: number;
  totalListings: number;
  avgRating: number;
  totalSales: number;
  nextTierProgress: { label: string; current: number; required: number }[];
}
