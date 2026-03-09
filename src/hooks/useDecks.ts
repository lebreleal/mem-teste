import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as deckService from '@/services/deckService';
import type { DeckWithStats } from '@/types/deck';

// Re-export for backward compatibility
export type { DeckWithStats } from '@/types/deck';

export const useDecks = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const decksQuery = useQuery({
    queryKey: ['decks', user?.id],
    queryFn: () => deckService.fetchDecksWithStats(user!.id),
    enabled: !!user,
    staleTime: 2 * 60_000, // 2 min — avoid refetch on every focus/render
  });

  const createDeck = useMutation({
    mutationFn: ({ name, folderId, parentDeckId, algorithmMode }: { name: string; folderId?: string | null; parentDeckId?: string | null; algorithmMode?: string }) => {
      if (!user) throw new Error('Not authenticated');
      return deckService.createDeck(user.id, name, folderId, parentDeckId, algorithmMode);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });

  const deleteDeck = useMutation({
    mutationFn: (id: string) => deckService.deleteDeck(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });

  const moveDeck = useMutation({
    mutationFn: ({ id, folderId, parentDeckId }: { id: string; folderId: string | null; parentDeckId?: string | null }) => deckService.moveDeck(id, folderId, parentDeckId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });

  const archiveDeck = useMutation({
    mutationFn: (id: string) => deckService.archiveDeck(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });

  const duplicateDeck = useMutation({
    mutationFn: (id: string) => {
      if (!user) throw new Error('Not authenticated');
      return deckService.duplicateDeck(user.id, id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });

  const resetProgress = useMutation({
    mutationFn: (id: string) => deckService.resetDeckProgress(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['decks'] });
      queryClient.invalidateQueries({ queryKey: ['cards'] });
      queryClient.invalidateQueries({ queryKey: ['study-queue'] });
    },
  });

  const reorderDecks = useMutation({
    mutationFn: (orderedIds: string[]) => deckService.reorderDecks(orderedIds),
    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: ['decks', user?.id] });
      const previous = queryClient.getQueryData<DeckWithStats[]>(['decks', user?.id]);
      if (previous) {
        const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
        const updated = previous.map(d => orderMap.has(d.id) ? { ...d, sort_order: orderMap.get(d.id)! } : d);
        queryClient.setQueryData(['decks', user?.id], updated);
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(['decks', user?.id], context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['decks'] }),
  });

  return {
    decks: decksQuery.data ?? [],
    isLoading: decksQuery.isLoading,
    createDeck,
    deleteDeck,
    moveDeck,
    archiveDeck,
    duplicateDeck,
    resetProgress,
    reorderDecks,
  };
};
