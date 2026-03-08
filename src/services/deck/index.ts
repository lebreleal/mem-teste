/**
 * Deck Service — Barrel export (Façade Pattern).
 * Re-exports all deck sub-modules for backward compatibility.
 * Consumers can import from '@/services/deckService' as before.
 */

// Stats (CQRS Read side)
export { fetchDecksWithStats } from './deckStats';

// CRUD operations
export {
  resolveUniqueDeckName,
  createDeck,
  deleteDeck,
  deleteDeckCascade,
  deleteFolderCascade,
  renameDeck,
  moveDeck,
  bulkMoveDecks,
  bulkArchiveDecks,
  bulkDeleteDecks,
  fetchDeck,
  changeAlgorithm,
  createAlgorithmCopy,
  getTurmaDeckNavInfo,
  archiveDeck,
  duplicateDeck,
  reorderDecks,
  resetDeckProgress,
} from './deckCrud';

// Import operations
export {
  importDeck,
  importDeckWithSubdecks,
  type CardImportInput,
  type RevlogImportEntry,
  type ImportProgressCallback,
} from './deckImport';
