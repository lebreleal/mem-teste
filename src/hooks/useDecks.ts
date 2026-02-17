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
    mutationFn: ({ id, folderId }: { id: string; folderId: string | null }) => deckService.moveDeck(id, folderId),
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

  return {
    decks: decksQuery.data ?? [],
    isLoading: decksQuery.isLoading,
    createDeck,
    deleteDeck,
    moveDeck,
    archiveDeck,
    duplicateDeck,
    resetProgress,
  };
};
