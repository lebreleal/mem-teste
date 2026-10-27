/**
 * AI credits (crown currency) — read-only on the client.
 *
 * The balance is owned by the server: every AI edge function holds an estimate
 * before calling the model and settles the exact cost afterwards. The client
 * only reads the cached profile row (kept fresh by the profile Realtime channel)
 * and asks the server once a day for the free daily allowance.
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, profileQueryKey } from '@/hooks/useProfile';
import { claimDailyAICredits } from '@/services/aiCreditsService';
import { getToday } from '@/lib/dateUtils';

export const useAICredits = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const profileQuery = useProfile();
  const userId = user?.id;
  const dailyClaim = useQuery({
    queryKey: ['ai-credits-daily-claim', userId, getToday()],
    queryFn: async () => {
      await claimDailyAICredits();
      await queryClient.invalidateQueries({ queryKey: profileQueryKey(userId) });
      return true;
    },
    enabled: !!userId,
    staleTime: Infinity,
    retry: 1,
  });

  // Number() defensivo: `numeric` pode chegar como string em alguns caminhos
  // (Realtime), e somar strings viraria concatenação → saldo exibido errado.
  const toNum = (v: unknown) => {
    const n = typeof v === 'string' ? Number(v) : (v as number);
    return typeof n === 'number' && Number.isFinite(n) ? n : 0;
  };

  return {
    credits: profileQuery.data?.id === userId
      ? toNum(profileQuery.data.ai_credits) + toNum(profileQuery.data.ai_credits_purchased) : 0,
    isLoading: !!userId && !profileQuery.data && !profileQuery.isError,
    isError: profileQuery.isError,
    refetch: profileQuery.refetch,
  };
};
