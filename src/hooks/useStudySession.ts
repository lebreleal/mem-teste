import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as studyService from '@/services/studyService';
import type { Rating } from '@/lib/fsrs';


export type { StudyQueueResult } from '@/services/studyService';

export const useStudySession = (deckId: string, folderId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const studyQueue = useQuery({
    queryKey: ['study-queue', folderId ? `folder-${folderId}` : deckId],
    queryFn: () => studyService.fetchStudyQueue(user!.id, deckId, folderId),
    enabled: !!user && !!(deckId || folderId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const submitReview = useMutation({
    mutationFn: async ({ card, rating, elapsedMs }: { card: any; rating: Rating; elapsedMs?: number }) => {
      if (!user) throw new Error('Not authenticated');
      return studyService.submitCardReview(
        user.id,
        card,
        rating,
        studyQueue.data?.algorithmMode || 'sm2',
        studyQueue.data?.deckConfig,
        elapsedMs,
      );
    },
    onSuccess: (_result, { card }) => {
      // Optimistic: update study-stats cache incrementally
      queryClient.setQueryData(['study-stats', user?.id], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          todayCards: (old.todayCards ?? 0) + 1,
        };
      });
    },
    onSettled: () => {
      // OPTIMIZATION: Only invalidate lightweight queries during active study.
      // Heavy queries (decks, deck-stats) are deferred to unmount or 10s delay.
      // This prevents 50+ cache invalidations during a 50-card study session.
      queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });

      // Defer heavy dashboard invalidations — they only matter when user leaves study
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['decks'] });
        queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
        queryClient.invalidateQueries({ queryKey: ['study-stats'] });
        queryClient.invalidateQueries({ queryKey: ['activity-full'] });
      }, 10_000); // 10s delay — user is still studying, no need to refetch dashboard
    },
  });

  return {
    queue: studyQueue.data?.cards ?? [],
    algorithmMode: studyQueue.data?.algorithmMode || 'fsrs',
    deckConfig: studyQueue.data?.deckConfig,
    isLiveDeck: studyQueue.data?.isLiveDeck ?? false,
    isLoading: studyQueue.isLoading,
    isFetching: studyQueue.isFetching,
    submitReview,
  };
};
