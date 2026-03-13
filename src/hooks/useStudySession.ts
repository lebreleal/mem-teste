import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as studyService from '@/services/studyService';
import type { Rating } from '@/lib/fsrs';


export type { StudyQueueResult } from '@/services/studyService';

export const useStudySession = (deckId: string, folderId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const studyQueue = useQuery<studyService.StudyQueueResult>({
    queryKey: ['study-queue', folderId ? `folder-${folderId}` : deckId],
    queryFn: () => studyService.fetchStudyQueue(user!.id, deckId, folderId),
    enabled: !!user && !!(deckId || folderId),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const submitReview = useMutation({
    mutationFn: async ({ card, rating, elapsedMs }: { card: any; rating: Rating; elapsedMs?: number }) => {
      if (!user) throw new Error('Not authenticated');
      const algorithmMode = studyQueue.data?.deckConfig?.algorithm_mode || 'fsrs';
      return studyService.submitCardReview(
        user.id, card, rating, algorithmMode, studyQueue.data?.deckConfig, elapsedMs,
      );
    },
    onSuccess: (result: any) => {
      queryClient.setQueryData(['study-stats', user?.id], (old: any) => {
        if (!old) return old;
        return { ...old, todayCards: (old.todayCards ?? 0) + 1 };
      });
      // Invalidate error deck counts when cards move
      if (result?.movedToError || result?.returnedFromError) {
        queryClient.invalidateQueries({ queryKey: ['error-deck-cards'] });
        queryClient.invalidateQueries({ queryKey: ['error-notebook-count'] });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['decks'] });
        queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
        queryClient.invalidateQueries({ queryKey: ['study-stats'] });
        queryClient.invalidateQueries({ queryKey: ['activity-full'] });
      }, 10_000);
    },
  });

  return {
    queue: studyQueue.data?.cards ?? [],
    algorithmMode: studyQueue.data?.algorithmMode || 'fsrs',
    deckConfig: studyQueue.data?.deckConfig,
    deckConfigs: {} as Record<string, any>,
    isLiveDeck: studyQueue.data?.isLiveDeck ?? false,
    isLoading: studyQueue.isLoading,
    isFetching: studyQueue.isFetching,
    submitReview,
  };
};
