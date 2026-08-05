/**
 * AI credits service — the only place the client touches credit RPCs.
 * Balances are debited server-side; the client can only claim the free
 * daily allowance and read its own ledger.
 */

import { supabase } from '@/integrations/supabase/client';

export interface CreditLedgerEntry {
  id: string;
  amount: number;
  kind: string;
  feature_key: string | null;
  balance_after: number;
  created_at: string;
}

/** Grant the free daily allowance (server-side no-op if already claimed today). */
export async function claimDailyAICredits(): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await supabase.rpc('grant_daily_ai_credits' as any);
  if (error) throw error;
}

/** Recent credit movements for the signed-in user. */
export async function fetchCreditLedger(userId: string, limit = 30): Promise<CreditLedgerEntry[]> {
  const { data, error } = await supabase
    .from('ai_credit_ledger' as never)
    .select('id, amount, kind:entry_type, feature_key, balance_after, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CreditLedgerEntry[];
}
