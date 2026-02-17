import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as turmaService from '@/services/turmaService';
export type { CreatorStats, SubjectPreview, RootLessonPreview, CommunityContentStats } from '@/types/community';

export const useCreatorStats = (ownerId: string | undefined) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['creator-stats', ownerId],
    queryFn: () => turmaService.fetchCreatorStats(ownerId!),
    enabled: !!user && !!ownerId,
    staleTime: 60_000,
  });
};

export const useCommunityContentStats = (turmaId: string | undefined) => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community-content-stats', turmaId],
    queryFn: () => turmaService.fetchCommunityContentStats(turmaId!),
    enabled: !!user && !!turmaId,
    staleTime: 60_000,
  });
};
