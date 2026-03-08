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
    staleTime: Infinity,       // never auto-refetch during the session
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
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
      queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
      queryClient.invalidateQueries({ queryKey: ['study-stats'] });
      queryClient.invalidateQueries({ queryKey: ['activity-full'] });
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