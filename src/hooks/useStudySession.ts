import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as studyService from '@/services/studyService';
import type { Rating } from '@/lib/fsrs';
import type { StudyQueueResult, StudyCard, DeckStudyConfig, CardReviewResult } from '@/types/study';

export type { StudyQueueResult, StudyCard, DeckStudyConfig } from '@/types/study';

export const useStudySession = (deckId: string, folderId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // "study all" mode: no deckId and no folderId → key = 'all'
  const isStudyAll = !deckId && !folderId;
  const queryKeySuffix = folderId ? `folder-${folderId}` : (deckId || 'all');

  const studyQueue = useQuery<StudyQueueResult>({
    queryKey: ['study-queue', queryKeySuffix],
    queryFn: () => studyService.fetchStudyQueue(user!.id, deckId, folderId),
    enabled: !!user && !!(deckId || folderId || isStudyAll),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const submitReview = useMutation({
    // Lei 1H: the local session queue is the single source of truth while
    // studying. Persistence happens in the background and is retried; it must
    // never block the UI nor roll the queue back.
    retry: 2,
    retryDelay: (attempt) => 400 * 2 ** attempt,
    mutationFn: async ({ card, rating, elapsedMs }: { card: StudyCard; rating: Rating; elapsedMs?: number }) => {
      if (!user) throw new Error('Not authenticated');
      const algorithmMode = studyQueue.data?.deckConfig?.algorithm_mode || 'fsrs';
      return studyService.submitCardReview(
        user.id, card, rating, algorithmMode, studyQueue.data?.deckConfig, elapsedMs,
      );
    },
    onSuccess: (result: CardReviewResult) => {
      queryClient.setQueryData(['study-stats', user?.id], (old: { todayCards?: number } | undefined) => {
        if (!old) return old;
        return { ...old, todayCards: (old.todayCards ?? 0) + 1 };
      });
      // Invalidate error deck counts when cards move
      if (result?.movedToError || result?.returnedFromError) {
        queryClient.invalidateQueries({ queryKey: ['error-deck-cards'] });
        queryClient.invalidateQueries({ queryKey: ['error-notebook-count'] });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Falha ao salvar a revisão',
        description: error?.message ?? 'Verifique sua conexão. A sessão continua normalmente.',
        variant: 'destructive',
      });
    },
    // No per-review invalidation: heavy dashboard/deck queries are refreshed
    // once on session exit (invalidateStudyQueries in Study.tsx cleanup).
  });

  return {
    queue: studyQueue.data?.cards ?? [] as StudyCard[],
    algorithmMode: studyQueue.data?.algorithmMode || 'fsrs',
    deckConfig: studyQueue.data?.deckConfig as DeckStudyConfig | undefined,
    deckConfigs: {} as Record<string, DeckStudyConfig>,
    isLiveDeck: studyQueue.data?.isLiveDeck ?? false,
    isLoading: studyQueue.isLoading,
    isFetching: studyQueue.isFetching,
    submitReview,
  };
};
