/**
 * AI credits (crown currency) — read-only on the client.
 *
 * The balance is owned by the server: every AI edge function holds an estimate
 * before calling the model and settles the exact cost afterwards. The client
 * only reads the cached profile row (kept fresh by the profile Realtime channel)
 * and asks the server once a day for the free daily allowance.
 */

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, profileQueryKey } from '@/hooks/useProfile';
import { claimDailyAICredits } from '@/services/aiCreditsService';
import { getToday } from '@/lib/dateUtils';

const DAILY_CLAIM_KEY = 'ai-credits-daily-claim';

export const useAICredits = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useProfile();
  const claimed = useRef(false);

  useEffect(() => {
    if (!user || claimed.current) return;
    if (localStorage.getItem(DAILY_CLAIM_KEY) === getToday()) return;
    claimed.current = true;

    claimDailyAICredits()
      .then(() => {
        localStorage.setItem(DAILY_CLAIM_KEY, getToday());
        queryClient.invalidateQueries({ queryKey: profileQueryKey(user.id) });
      })
      .catch(() => {
        claimed.current = false;
      });
  }, [user, queryClient]);

  // Number() defensivo: `numeric` pode chegar como string em alguns caminhos
  // (Realtime), e somar strings viraria concatenação → saldo exibido errado.
  const toNum = (v: unknown) => {
    const n = typeof v === 'string' ? Number(v) : (v as number);
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  };

  return {
    credits: toNum(profileQuery.data?.ai_credits) + toNum(profileQuery.data?.ai_credits_purchased),
    isLoading: profileQuery.isLoading,
    refetch: profileQuery.refetch,
  };
};
