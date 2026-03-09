import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useProfile, profileQueryKey } from '@/hooks/useProfile';

export interface RankingEntry {
  user_id: string;
  user_name: string;
  cards_30d: number;
  minutes_30d: number;
  current_streak: number;
}

export function useRanking() {
  const { user } = useAuth();

  const query = useQuery<RankingEntry[]>({
    queryKey: ['ranking'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_user_ranking' as any);
      if (error) throw error;
      return (data as any[]).map(r => ({
        user_id: r.user_id,
        user_name: r.user_name,
        cards_30d: Number(r.cards_30d),
        minutes_30d: Number(r.minutes_30d),
        current_streak: Number(r.current_streak),
      }));
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
  });

  return query;
}

export function useTogglePublicProfile() {
  const { user } = useAuth();
  const profile = useProfile();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (isPublic: boolean) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('profiles')
        .update({ is_profile_public: isPublic } as any)
        .eq('id', user.id);
      if (error) throw error;
    },
    onMutate: async (isPublic) => {
      if (!user) return;
      await queryClient.cancelQueries({ queryKey: profileQueryKey(user.id) });
      queryClient.setQueryData(profileQueryKey(user.id), (old: any) =>
        old ? { ...old, is_profile_public: isPublic } : old
      );
    },
    onSettled: () => {
      if (user) {
        queryClient.invalidateQueries({ queryKey: profileQueryKey(user.id) });
        queryClient.invalidateQueries({ queryKey: ['ranking'] });
      }
    },
  });
}
