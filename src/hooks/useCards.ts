import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import * as cardService from '@/services/cardService';
import { invalidateDeckRelatedQueries } from '@/lib/queryKeys';

export type { CardRow } from '@/services/cardService';

export const useCards = (deckId: string, opts?: { enableQuery?: boolean }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const enableQuery = opts?.enableQuery !== false;

  const cardsQuery = useQuery({
    queryKey: ['cards', deckId],
    queryFn: () => cardService.fetchCards(deckId),
    enabled: enableQuery && !!user && !!deckId,
  });

  const createCard = useMutation({
    mutationFn: async (input: { frontContent: string; backContent: string; cardType?: string } | { cards: { frontContent: string; backContent: string; cardType: string }[] }) => {
      if ('cards' in input) {
        return cardService.createCards(deckId, input.cards);
      }
      return cardService.createCard(deckId, input);
    },
    onSuccess: () => invalidateDeckRelatedQueries(queryClient, deckId),
  });

  const updateCard = useMutation({
    mutationFn: ({ id, frontContent, backContent }: { id: string; frontContent: string; backContent: string }) =>
      cardService.updateCard(id, frontContent, backContent),
    onSuccess: () => invalidateDeckRelatedQueries(queryClient, deckId),
  });

  const deleteCard = useMutation({
    mutationFn: (id: string) => cardService.deleteCard(id),
    onSuccess: () => invalidateDeckRelatedQueries(queryClient, deckId),
  });

  return { cards: cardsQuery.data ?? [], isLoading: cardsQuery.isLoading, createCard, updateCard, deleteCard };
};
