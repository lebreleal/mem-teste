/**
 * Centralized query key helpers and invalidation utilities.
 * Ensures consistent cache invalidation across all hooks and components.
 */

import type { QueryClient } from '@tanstack/react-query';

/** Invalidate all queries related to a deck's data (cards, stats, deck list). */
export function invalidateDeckRelatedQueries(queryClient: QueryClient, deckId?: string) {
  queryClient.invalidateQueries({ queryKey: ['decks'] });
  queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
  queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
  queryClient.invalidateQueries({ queryKey: ['cards-meta'] });
  queryClient.invalidateQueries({ queryKey: ['cards-display'] });
  queryClient.invalidateQueries({ queryKey: ['study-queue'] });
  if (deckId) {
    queryClient.invalidateQueries({ queryKey: ['cards', deckId] });
    queryClient.invalidateQueries({ queryKey: ['deck', deckId] });
  }
}

/** Invalidate study-related queries after a review. */
export function invalidateStudyQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ['decks'] });
  queryClient.invalidateQueries({ queryKey: ['deck-stats'] });
  queryClient.invalidateQueries({ queryKey: ['cards-aggregated'] });
  queryClient.invalidateQueries({ queryKey: ['cards-meta'] });
  queryClient.invalidateQueries({ queryKey: ['cards-display'] });
  queryClient.invalidateQueries({ queryKey: ['study-queue'] });
}
