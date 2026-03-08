/**
 * Tests for domain entity mappers.
 */

import { describe, it, expect } from 'vitest';
import { mapCardState, mapCardType, mapCardRow, mapStudyStatsRow, mapActivityBreakdown } from '@/types/domain';

describe('mapCardState', () => {
  it('maps numeric states correctly', () => {
    expect(mapCardState(0)).toBe('new');
    expect(mapCardState(1)).toBe('learning');
    expect(mapCardState(2)).toBe('review');
    expect(mapCardState(3)).toBe('relearning');
  });

  it('defaults null to new', () => {
    expect(mapCardState(null)).toBe('new');
  });

  it('defaults unknown to new', () => {
    expect(mapCardState(99)).toBe('new');
  });
});

describe('mapCardType', () => {
  it('maps valid types', () => {
    expect(mapCardType('basic')).toBe('basic');
    expect(mapCardType('cloze')).toBe('cloze');
    expect(mapCardType('multiple_choice')).toBe('multiple_choice');
    expect(mapCardType('image_occlusion')).toBe('image_occlusion');
  });

  it('defaults unknown to basic', () => {
    expect(mapCardType('unknown')).toBe('basic');
    expect(mapCardType('')).toBe('basic');
  });
});

describe('mapCardRow', () => {
  it('converts a DB row to a domain Card', () => {
    const row = {
      id: 'abc',
      deck_id: 'deck1',
      front_content: '<p>Front</p>',
      back_content: '<p>Back</p>',
      card_type: 'cloze',
      state: 2,
      stability: 5.5,
      difficulty: 3.2,
      scheduled_date: '2026-03-10T00:00:00Z',
      last_reviewed_at: '2026-03-08T10:00:00Z',
      learning_step: 0,
      created_at: '2026-01-01T00:00:00Z',
    };

    const card = mapCardRow(row);
    expect(card.id).toBe('abc');
    expect(card.deckId).toBe('deck1');
    expect(card.cardType).toBe('cloze');
    expect(card.state).toBe('review');
    expect(card.stability).toBe(5.5);
    expect(card.scheduledDate).toBeInstanceOf(Date);
    expect(card.lastReviewedAt).toBeInstanceOf(Date);
  });

  it('handles null last_reviewed_at', () => {
    const row = {
      id: 'x', deck_id: 'd', front_content: '', back_content: '',
      card_type: 'basic', state: 0, stability: 0, difficulty: 0,
      scheduled_date: '2026-03-10T00:00:00Z', last_reviewed_at: null,
      learning_step: 0, created_at: '2026-01-01T00:00:00Z',
    };
    expect(mapCardRow(row).lastReviewedAt).toBeNull();
  });
});

describe('mapStudyStatsRow', () => {
  it('maps RPC result to StudySnapshot', () => {
    const row = {
      streak: 15,
      freezes_available: 2,
      today_minutes: 30,
      avg_minutes_7d: 25,
      today_cards: 50,
      energy: 100,
      daily_energy_earned: 5,
      mascot_state: 'happy',
      last_study_date: '2026-03-08T10:00:00Z',
    };

    const stats = mapStudyStatsRow(row);
    expect(stats.streak).toBe(15);
    expect(stats.todayMinutes).toBe(30);
    expect(stats.mascotState).toBe('happy');
    expect(stats.lastStudyDate).toBeInstanceOf(Date);
  });

  it('handles null/missing fields gracefully', () => {
    const stats = mapStudyStatsRow({});
    expect(stats.streak).toBe(0);
    expect(stats.energy).toBe(0);
    expect(stats.mascotState).toBe('sleeping');
    expect(stats.lastStudyDate).toBeNull();
  });
});

describe('mapActivityBreakdown', () => {
  it('converts RPC activity data to domain ActivitySummary', () => {
    const data = {
      dayMap: {
        '2026-03-07': { date: '2026-03-07', cards: 20, minutes: 15, newCards: 5, learning: 3, review: 10, relearning: 2 },
        '2026-03-08': { date: '2026-03-08', cards: 10, minutes: 8, newCards: 2, learning: 1, review: 6, relearning: 1 },
      },
      streak: 5,
      bestStreak: 12,
      totalActiveDays: 30,
      freezesAvailable: 3,
      freezesUsed: 1,
      frozenDays: ['2026-03-06'],
    };

    const summary = mapActivityBreakdown(data);
    expect(Object.keys(summary.days)).toHaveLength(2);
    expect(summary.days['2026-03-07'].totalCards).toBe(20);
    expect(summary.streak).toBe(5);
    expect(summary.bestStreak).toBe(12);
    expect(summary.frozenDays.has('2026-03-06')).toBe(true);
    expect(summary.frozenDays).toBeInstanceOf(Set);
  });

  it('handles empty data', () => {
    const summary = mapActivityBreakdown({});
    expect(Object.keys(summary.days)).toHaveLength(0);
    expect(summary.streak).toBe(0);
    expect(summary.frozenDays.size).toBe(0);
  });
});
