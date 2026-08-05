/**
 * Personal AI credit history (read-only) for the signed-in user.
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { fetchCreditLedger, type CreditLedgerEntry } from '@/services/aiCreditsService';

export type { CreditLedgerEntry };

export const useCreditLedger = (enabled = true) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['ai-credit-ledger', user?.id],
    queryFn: () => fetchCreditLedger(user!.id, 30),
    enabled: enabled && !!user?.id,
    staleTime: 60_000,
  });
};
