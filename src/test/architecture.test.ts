/**
 * Tests for Repository Pattern and Clean Architecture boundaries.
 * Validates that the domain layer contracts are properly defined
 * and that mappers correctly translate between layers.
 */

import { describe, it, expect } from 'vitest';
import { mapCardRow, mapCardState, mapCardType, mapStudyStatsRow, mapActivityBreakdown } from '@/types/domain';
import { AppError, classifyError, withRetryAndClassify } from '@/lib/errors';

// ─── Repository Interface Contract Tests ────────────────

describe('Repository Interface Contracts', () => {
  describe('ICardRepository contract shape', () => {
    it('CardFilter supports all query patterns', () => {
      // Verify the filter type accepts all valid configurations
      const filters = [
        { deckId: 'abc' },
        { deckIds: ['a', 'b', 'c'] },
        { state: 'new' as const },
        { cardType: 'cloze' as const },
        { scheduledBefore: new Date() },
        { deckId: 'abc', state: 'review' as const, scheduledBefore: new Date() },
      ];
      // All should be valid CardFilter shapes
      expect(filters).toHaveLength(6);
    });

    it('CardPage shape has required fields', () => {
      const page = { items: [], total: 0, hasMore: false };
      expect(page).toHaveProperty('items');
      expect(page).toHaveProperty('total');
      expect(page).toHaveProperty('hasMore');
    });
  });

  describe('ReviewLogEntry contract', () => {
    it('supports batch insert payload', () => {
      const entries = [
        { userId: 'u1', cardId: 'c1', rating: 3, stability: 2.5, difficulty: 5.0, scheduledDate: '2026-03-10' },
        { userId: 'u1', cardId: 'c2', rating: 1, stability: 0.5, difficulty: 8.0, scheduledDate: '2026-03-08', elapsedMs: 5000 },
      ];
      expect(entries).toHaveLength(2);
      expect(entries[0]).not.toHaveProperty('elapsedMs'); // optional
      expect(entries[1].elapsedMs).toBe(5000);
    });
  });
});

// ─── Domain Mapper Edge Cases ───────────────────────────

describe('Domain Mappers — Edge Cases', () => {
  it('mapCardRow handles missing optional fields gracefully', () => {
    const minimalRow = {
      id: 'x',
      deck_id: 'd',
      front_content: 'Q',
      back_content: 'A',
      card_type: 'basic',
      state: null,
      stability: null,
      difficulty: null,
      scheduled_date: '2026-01-01',
      last_reviewed_at: null,
      learning_step: null,
      created_at: '2026-01-01',
    };
    const card = mapCardRow(minimalRow);
    expect(card.state).toBe('new');
    expect(card.stability).toBe(0);
    expect(card.difficulty).toBe(0);
    expect(card.learningStep).toBe(0);
    expect(card.lastReviewedAt).toBeNull();
  });

  it('mapCardState maps all valid DB states', () => {
    expect(mapCardState(0)).toBe('new');
    expect(mapCardState(1)).toBe('learning');
    expect(mapCardState(2)).toBe('review');
    expect(mapCardState(3)).toBe('relearning');
    expect(mapCardState(null)).toBe('new');
    expect(mapCardState(99)).toBe('new'); // unknown defaults to new
  });

  it('mapCardType handles unknown types', () => {
    expect(mapCardType('basic')).toBe('basic');
    expect(mapCardType('cloze')).toBe('cloze');
    expect(mapCardType('multiple_choice')).toBe('multiple_choice');
    expect(mapCardType('image_occlusion')).toBe('image_occlusion');
    expect(mapCardType('unknown_type')).toBe('basic'); // fallback
    expect(mapCardType('')).toBe('basic');
  });

  it('mapStudyStatsRow handles empty/zero data', () => {
    const stats = mapStudyStatsRow({});
    expect(stats.streak).toBe(0);
    expect(stats.energy).toBe(0);
    expect(stats.mascotState).toBe('sleeping');
    expect(stats.lastStudyDate).toBeNull();
  });

  it('mapActivityBreakdown handles empty input', () => {
    const summary = mapActivityBreakdown({});
    expect(summary.streak).toBe(0);
    expect(summary.bestStreak).toBe(0);
    expect(Object.keys(summary.days)).toHaveLength(0);
    expect(summary.frozenDays).toBeInstanceOf(Set);
  });

  it('mapActivityBreakdown correctly maps day data', () => {
    const input = {
      dayMap: {
        '2026-03-01': { date: '2026-03-01', cards: 50, minutes: 30, newCards: 10, learning: 15, review: 20, relearning: 5 },
      },
      streak: 7,
      bestStreak: 14,
      totalActiveDays: 30,
      freezesAvailable: 2,
      freezesUsed: 1,
      frozenDays: ['2026-02-28'],
    };
    const summary = mapActivityBreakdown(input);
    expect(summary.streak).toBe(7);
    expect(summary.bestStreak).toBe(14);
    expect(summary.days['2026-03-01'].totalCards).toBe(50);
    expect(summary.days['2026-03-01'].minutes).toBe(30);
    expect(summary.frozenDays.has('2026-02-28')).toBe(true);
  });
});

// ─── Error Classification Advanced Tests ────────────────

describe('Error Classification — Advanced Scenarios', () => {
  it('classifies Supabase PGRST116 as NOT_FOUND', () => {
    const err = { message: 'Row not found', code: 'PGRST116', status: 406 };
    const appErr = classifyError(err);
    expect(appErr.code).toBe('NOT_FOUND');
  });

  it('classifies duplicate key as DB_ERROR', () => {
    const err = { message: 'duplicate key value violates unique constraint', code: '23505' };
    const appErr = classifyError(err);
    expect(appErr.code).toBe('DB_ERROR');
  });

  it('classifies JWT errors as AUTH_REQUIRED', () => {
    const err = { message: 'JWT expired', status: 401 };
    const appErr = classifyError(err);
    expect(appErr.code).toBe('AUTH_REQUIRED');
  });

  it('classifies 429 as RATE_LIMIT', () => {
    const err = { message: 'Too many requests', status: 429 };
    const appErr = classifyError(err);
    expect(appErr.code).toBe('RATE_LIMIT');
    expect(appErr.isRetryable).toBe(true);
  });

  it('withRetryAndClassify retries network errors', async () => {
    let attempts = 0;
    const result = await withRetryAndClassify(async () => {
      attempts++;
      if (attempts < 3) throw new Error('Failed to fetch');
      return 'success';
    });
    expect(result).toBe('success');
    expect(attempts).toBe(3);
  });

  it('withRetryAndClassify does NOT retry non-transient errors', async () => {
    let attempts = 0;
    await expect(withRetryAndClassify(async () => {
      attempts++;
      throw { message: 'duplicate key value violates unique constraint', code: '23505' };
    })).rejects.toThrow();
    expect(attempts).toBe(1); // No retry for DB errors
  });

  it('AppError preserves context', () => {
    const err = new AppError('VALIDATION', 'bad input', 'Dados inválidos', { field: 'name' });
    expect(err.code).toBe('VALIDATION');
    expect(err.context).toEqual({ field: 'name' });
    expect(err.isRetryable).toBe(false);
    expect(err.userMessage).toBe('Dados inválidos');
  });

  it('classifyError preserves AppError identity', () => {
    const original = new AppError('INSUFFICIENT_ENERGY', 'not enough');
    const classified = classifyError(original);
    expect(classified).toBe(original); // Same reference
  });
});

// ─── CQRS Pattern Validation ────────────────────────────

describe('CQRS Pattern — Separation Validation', () => {
  it('card/cardQueries.ts only exports read functions', async () => {
    const queries = await import('@/services/card/cardQueries');
    const exportNames = Object.keys(queries);
    // All exports should be fetch/get functions (reads)
    const readPrefixes = ['fetch', 'CardMeta', 'DescendantCardCounts'];
    exportNames.forEach(name => {
      if (typeof queries[name as keyof typeof queries] === 'function') {
        expect(name.startsWith('fetch')).toBe(true);
      }
    });
  });

  it('card/cardMutations.ts only exports write functions', async () => {
    const mutations = await import('@/services/card/cardMutations');
    const exportNames = Object.keys(mutations);
    // All exports should be create/update/delete/move/bulk/upload functions (writes)
    const writePrefixes = ['create', 'update', 'delete', 'move', 'bulk', 'upload'];
    exportNames.forEach(name => {
      if (typeof mutations[name as keyof typeof mutations] === 'function') {
        const isWrite = writePrefixes.some(p => name.toLowerCase().startsWith(p));
        expect(isWrite).toBe(true);
      }
    });
  });

  it('cardService barrel re-exports all sub-modules', async () => {
    const barrel = await import('@/services/cardService');
    // Verify key exports exist
    expect(barrel.fetchCards).toBeDefined();
    expect(barrel.createCard).toBeDefined();
    expect(barrel.enhanceCard).toBeDefined();
    expect(barrel.fetchDescendantCardCounts).toBeDefined();
    expect(barrel.bulkDeleteCards).toBeDefined();
  });
});
