import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useStudyStats } from '@/hooks/useStudyStats';
import { useToast } from '@/hooks/use-toast';
import * as missionService from '@/services/missionService';
import type { MissionDefinition, UserMission, MissionWithProgress } from '@/types/missions';

export type { MissionDefinition, UserMission, MissionWithProgress } from '@/types/missions';

export const useMissions = () => {
  const { user } = useAuth();
  const { data: stats } = useStudyStats();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['missions', user?.id],
    queryFn: () => missionService.fetchMissions(user!.id, {
      todayMinutes: stats?.todayMinutes ?? 0,
      streak: stats?.streak ?? 0,
    }),
    enabled: !!user,
    staleTime: 30_000,
  });

  const claimReward = useMutation({
    mutationFn: (mission: MissionWithProgress) => {
      if (!user) throw new Error('Not authenticated');
      return missionService.claimMissionReward(user.id, mission);
    },
    onSuccess: (mission) => {
      toast({ title: `🎉 +${mission.reward_credits} créditos IA!`, description: mission.title });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
    onError: () => {
      toast({ title: 'Erro ao resgatar recompensa', variant: 'destructive' });
    },
  });

  return { missions: query.data ?? [], isLoading: query.isLoading, claimReward };
};

export const useXPLeaderboard = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['xp-leaderboard'],
    queryFn: () => missionService.fetchXPLeaderboard(),
    enabled: !!user,
    staleTime: 120_000,
  });
};
