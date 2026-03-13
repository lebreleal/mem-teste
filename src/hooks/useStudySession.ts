import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as studyService from '@/services/studyService';
import type { Rating } from '@/lib/fsrs';


export type { StudyQueueResult } from '@/services/studyService';

interface AnyQueueResult {
  cards: any[];
  algorithmMode?: string;
  deckConfig?: any;
  deckConfigs?: Record<string, any>;
  isLiveDeck: boolean;
}

export const useStudySession = (deckId: string, folderId?: string) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isUnifiedMode = deckId === '__all__';

  const studyQueue = useQuery<AnyQueueResult>({
    queryKey: ['study-queue', isUnifiedMode ? 'unified' : (folderId ? `folder-${folderId}` : deckId)],
    queryFn: async (): Promise<AnyQueueResult> => {
      if (isUnifiedMode) {
        return studyService.fetchUnifiedStudyQueue(user!.id);
      }
      return studyService.fetchStudyQueue(user!.id, deckId, folderId);
    },
    enabled: !!user && (isUnifiedMode || !!(deckId || folderId)),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const deckConfigs = studyQueue.data?.deckConfigs as Record<string, any> | undefined;
  const defaultDeckConfig = isUnifiedMode ? {} : studyQueue.data?.deckConfig;

  const submitReview = useMutation({
    mutationFn: async ({ card, rating, elapsedMs }: { card: any; rating: Rating; elapsedMs?: number }) => {
      if (!user) throw new Error('Not authenticated');
      const cardDeckConfig = isUnifiedMode
        ? (deckConfigs?.[card.deck_id] ?? {})
        : studyQueue.data?.deckConfig;
      const algorithmMode = cardDeckConfig?.algorithm_mode || 'fsrs';
      return studyService.submitCardReview(
        user.id, card, rating, algorithmMode, cardDeckConfig, elapsedMs,
      );
    },
    onSuccess: () => {
      queryClient.setQueryData(['study-stats', user?.id], (old: any) => {
        if (!old) return old;
        return { ...old, todayCards: (old.todayCards ?? 0) + 1 };
      });
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
    algorithmMode: isUnifiedMode ? 'fsrs' : (studyQueue.data?.algorithmMode || 'fsrs'),
    deckConfig: defaultDeckConfig,
    deckConfigs: deckConfigs ?? {},
    isLiveDeck: studyQueue.data?.isLiveDeck ?? false,
    isLoading: studyQueue.isLoading,
    isFetching: studyQueue.isFetching,
    submitReview,
  };
};
