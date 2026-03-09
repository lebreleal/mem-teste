import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { SubjectRetention, PerformanceData } from '@/types/performance';

export type { CardTypeBreakdown, SubjectRetention, PerformanceData } from '@/types/performance';

export const usePerformance = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user-performance', user?.id],
    queryFn: async (): Promise<PerformanceData> => {
      if (!user) return { subjects: [], totalPendingReviews: 0, totalNewCards: 0, upcomingExams: [] };

      // Single RPC call replaces N+1 queries (ISP: Interface Segregation)
      const { data, error } = await supabase.rpc('get_user_performance_summary', {
        p_user_id: user.id,
      } as any);

      if (error) throw error;

      const result = data as any;
      if (!result) return { subjects: [], totalPendingReviews: 0, totalNewCards: 0, upcomingExams: [] };

      // Map server response to domain types
      const subjects: SubjectRetention[] = (result.subjects ?? []).map((s: any) => ({
        subjectId: s.subjectId,
        subjectName: s.subjectName,
        avgRetention: Number(s.avg_retention ?? 0),
        totalCards: Number(s.totalCards ?? 0),
        reviewCards: Number(s.reviewCards ?? 0),
        newCards: Number(s.newCards ?? 0),
        lastReviewAt: s.lastReviewAt ?? null,
        trend: Number(s.avg_retention ?? 0) >= 70 ? 'up' as const : Number(s.avg_retention ?? 0) < 50 ? 'down' as const : 'stable' as const,
        deckIds: [s.subjectId],
        todayCardTypes: s.todayCardTypes ?? { basic: 0, cloze: 0, multiple_choice: 0, image_occlusion: 0 },
      }));

      return {
        subjects,
        totalPendingReviews: Number(result.totalPendingReviews ?? 0),
        totalNewCards: Number(result.totalNewCards ?? 0),
        upcomingExams: [],
      };
    },
    enabled: !!user,
    staleTime: 30_000,
  });
};
