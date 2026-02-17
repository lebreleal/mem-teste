import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as studyService from '@/services/studyService';

export type { StudyStats } from '@/services/studyService';

export const useStudyStats = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['study-stats', user?.id],
    queryFn: () => studyService.fetchStudyStats(user!.id),
    enabled: !!user,
    staleTime: 60_000,
  });
};
