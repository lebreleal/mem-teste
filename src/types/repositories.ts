/**
 * Repository Interfaces — Clean Architecture: Dependency Inversion Principle.
 *
 * These interfaces define the contracts between Use Cases (business logic)
 * and Infrastructure (Supabase, APIs). The business logic depends on
 * these abstractions, NOT on concrete implementations.
 *
 * Benefits:
 * - Testability: Use Cases can be tested with in-memory implementations
 * - Flexibility: Swap Supabase for another provider without changing logic
 * - Boundary clarity: Infrastructure details don't leak into domain
 */

import type { Card, CardState, CardType } from './domain';

// ─── Card Repository ───────────────────────────────────

export interface CardFilter {
  deckId?: string;
  deckIds?: string[];
  state?: CardState;
  cardType?: CardType;
  scheduledBefore?: Date;
}

export interface CardPage {
  items: Card[];
  total: number;
  hasMore: boolean;
}

export interface ICardRepository {
  /** Fetch a single card by ID. */
  findById(id: string): Promise<Card | null>;

  /** Fetch cards with filters and pagination. */
  findMany(filter: CardFilter, limit?: number, offset?: number): Promise<CardPage>;

  /** Create a single card. Returns the created card. */
  create(deckId: string, input: { frontContent: string; backContent: string; cardType?: string }): Promise<Card>;

  /** Create multiple cards in batch. */
  createBatch(deckId: string, cards: { frontContent: string; backContent: string; cardType: string }[]): Promise<Card[]>;

  /** Update a card's content. */
  update(id: string, frontContent: string, backContent: string): Promise<Card>;

  /** Delete a card by ID. */
  delete(id: string): Promise<void>;

  /** Move card(s) to a different deck. */
  move(ids: string[], targetDeckId: string): Promise<void>;

  /** Count cards grouped by state for a deck hierarchy. */
  countByState(deckId: string): Promise<Record<CardState, number>>;
}

// ─── Review Log Repository ─────────────────────────────

export interface ReviewLogEntry {
  userId: string;
  cardId: string;
  rating: number;
  stability: number;
  difficulty: number;
  scheduledDate: string;
  state?: number;
  elapsedMs?: number | null;
}

export interface IReviewLogRepository {
  /** Insert a single review log. */
  insert(entry: ReviewLogEntry): Promise<void>;

  /** Insert multiple review logs in a single batch (reduces DB round-trips). */
  insertBatch(entries: ReviewLogEntry[]): Promise<void>;

  /** Get count of reviews for a user on a specific date. */
  countForDate(userId: string, date: Date): Promise<number>;
}

// ─── Deck Repository ───────────────────────────────────

export interface IDeckRepository {
  /** Fetch all decks for a user. */
  findAllByUser(userId: string): Promise<any[]>;

  /** Fetch a single deck by ID. */
  findById(id: string): Promise<any | null>;

  /** Get all descendant deck IDs (recursive). */
  getDescendantIds(deckId: string): Promise<string[]>;
}

// ─── Study Stats Repository ────────────────────────────

export interface IStudyStatsRepository {
  /** Get aggregated study statistics for a user. */
  getSummary(userId: string, tzOffsetMinutes: number): Promise<any>;

  /** Get activity breakdown for a date range. */
  getActivityBreakdown(userId: string, tzOffsetMinutes: number, days: number): Promise<any>;

  /** Get performance summary with retention per subject. */
  getPerformanceSummary(userId: string): Promise<any>;
}
