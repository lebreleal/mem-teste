/**
 * Card Service — Barrel export (Façade Pattern).
 * Re-exports all card sub-modules for backward compatibility.
 * Consumers can import from '@/services/cardService' as before.
 */

export type { CardRow } from '@/types/deck';

// Queries (CQRS Read side)
export {
  fetchCards,
  fetchAggregatedCardsMeta,
  fetchAggregatedCardsPage,
  fetchAggregatedCards,
  fetchClozeSiblings,
  fetchDescendantCardCounts,
  fetchDescendantCardsPage,
  fetchAggregatedStats,
  type CardMeta,
  type DescendantCardCounts,
} from './cardQueries';

// Mutations (CQRS Write side)
export {
  createCard,
  createCards,
  updateCard,
  deleteCard,
  moveCard,
  bulkMoveCards,
  bulkDeleteCards,
  buryCards,
  uploadCardImage,
} from './cardMutations';

// AI Operations
export { enhanceCard } from './cardAI';
