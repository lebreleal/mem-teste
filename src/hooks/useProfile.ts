/**
 * Centralized profile hook with 5-minute staleTime.
 * Shared across useEnergy, useStudyStats, useDashboardState, useStudyPlan, etc.
 * Eliminates redundant profile fetches (~5 per page load → 1).
 */

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export interface ProfileData {
  id: string;
  energy: number;
  successful_cards_counter: number;
  daily_cards_studied: number;
  daily_energy_earned: number;
  daily_new_cards_limit: number;
  daily_study_minutes: number;
  last_energy_recharge: string | null;
  last_study_reset_date: string | null;
  created_at: string;
  weekly_new_cards: Record<string, number> | null;
  weekly_study_minutes: Record<string, number> | null;
}

const PROFILE_COLUMNS = 'id, energy, successful_cards_counter, daily_cards_studied, daily_energy_earned, daily_new_cards_limit, daily_study_minutes, last_energy_recharge, last_study_reset_date, created_at, weekly_new_cards, weekly_study_minutes';

export const profileQueryKey = (userId?: string) => ['profile', userId];

export const useProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<ProfileData>({
    queryKey: profileQueryKey(user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      return data as unknown as ProfileData;
    },
    enabled: !!user,
    staleTime: 5 * 60_000, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // Realtime subscription: auto-update cache when profile changes server-side
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`profile-${user.id}`)
      .on(
        'postgres_changes' as any,
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload: any) => {
          // Update cache directly with new data (avoid refetch)
          const newRow = payload.new;
          if (newRow) {
            queryClient.setQueryData(profileQueryKey(user.id), (old: ProfileData | undefined) => {
              if (!old) return old;
              return { ...old, ...newRow };
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return query;
};

/** Prefetch profile data — call once after auth to warm the cache. */
export const prefetchProfile = async (userId: string, queryClient: any) => {
  await queryClient.prefetchQuery({
    queryKey: profileQueryKey(userId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_COLUMNS)
        .eq('id', userId)
        .single();
      if (error) throw error;
      return data as unknown as ProfileData;
    },
    staleTime: 5 * 60_000,
  });
};

/** Invalidate profile cache — call after mutations that touch profile fields. */
export const useInvalidateProfile = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return () => {
    if (user) {
      queryClient.invalidateQueries({ queryKey: profileQueryKey(user.id) });
    }
  };
};
