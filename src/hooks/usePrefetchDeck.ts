import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import * as deckService from '@/services/deckService';
import * as cardService from '@/services/cardService';

const CARDS_PAGE = 100;

/**
 * Intent-based prefetch for the deck detail screen.
 *
 * A click is preceded by ~100-300ms of hover (or a touchstart on mobile). We
 * use that window to warm exactly the queries `DeckDetailContext` will ask for,
 * so the destination screen renders from cache instead of from the network.
 *
 * Each deck is warmed at most once per mount to avoid hover-storm requests.
 */
export function usePrefetchDeck() {
  const queryClient = useQueryClient();
  const warmed = useRef<Set<string>>(new Set());

  return useCallback(
    (deckId: string) => {
      if (!deckId || warmed.current.has(deckId)) return;
      warmed.current.add(deckId);

      void queryClient.prefetchQuery({
        queryKey: ['deck', deckId],
        queryFn: () => deckService.fetchDeck(deckId),
        staleTime: 30_000,
      });
      void queryClient.prefetchQuery({
        queryKey: ['card-counts', deckId, false],
        queryFn: () => cardService.fetchDescendantCardCounts(deckId),
        staleTime: 30_000,
      });
      void queryClient.prefetchInfiniteQuery({
        queryKey: ['cards-display', deckId, false],
        initialPageParam: 0,
        queryFn: ({ pageParam }) =>
          cardService.fetchDescendantCardsPage(deckId, CARDS_PAGE, pageParam as number),
        staleTime: 30_000,
      });
    },
    [queryClient],
  );
}
