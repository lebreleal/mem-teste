import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useProfile } from '@/hooks/useProfile';
import * as studyService from '@/services/studyService';

export type { StudyStats } from '@/services/studyService';

export const useStudyStats = () => {
  const { user } = useAuth();
  const profileQuery = useProfile();

  return useQuery({
    queryKey: ['study-stats', user?.id],
    queryFn: () => {
      const p = profileQuery.data;
      const cachedProfile = p ? {
        energy: p.energy,
        daily_energy_earned: p.daily_energy_earned,
        last_study_reset_date: p.last_study_reset_date,
        daily_cards_studied: p.daily_cards_studied,
        created_at: p.created_at,
      } : undefined;
      return studyService.fetchStudyStats(user!.id, cachedProfile);
    },
    enabled: !!user,
    staleTime: 60_000,
  });
};
