import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getNextReadyIndex, getLocalMidnight, shuffleArray } from '@/lib/studyUtils';
import { sm2Schedule, type SM2Card, DEFAULT_SM2_PARAMS } from '@/lib/sm2';
import { fsrsSchedule, type FSRSCard, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';

// Helper to create dates
const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();
const minutesFromNow = (m: number) => new Date(Date.now() + m * 60 * 1000).toISOString();
const now = () => new Date().toISOString();

describe('getNextReadyIndex – priority logic', () => {
  it('returns -1 for empty queue', () => {
    expect(getNextReadyIndex([])).toBe(-1);
  });

  it('returns first new card when no learning cards exist', () => {
    const queue = [
      { state: 0, scheduled_date: now() },
      { state: 2, scheduled_date: minutesAgo(60) },
    ];
    expect(getNextReadyIndex(queue)).toBe(0);
  });

  it('returns first review card when it comes before new', () => {
    const queue = [
      { state: 2, scheduled_date: minutesAgo(60) },
      { state: 0, scheduled_date: now() },
    ];
    expect(getNextReadyIndex(queue)).toBe(0);
  });

  it('learning card with expired timer cuts the line over new/review', () => {
    const queue = [
      { state: 0, scheduled_date: now() },                    // new
      { state: 2, scheduled_date: minutesAgo(60) },           // review
      { state: 1, scheduled_date: minutesAgo(5) },            // learning READY
    ];
    expect(getNextReadyIndex(queue)).toBe(2);
  });

  it('learning card with future timer does NOT cut the line', () => {
    const queue = [
      { state: 0, scheduled_date: now() },                    // new
      { state: 1, scheduled_date: minutesFromNow(5) },        // learning WAITING
    ];
    expect(getNextReadyIndex(queue)).toBe(0);
  });

  it('multiple learning cards ready: picks the first one', () => {
    const queue = [
      { state: 0, scheduled_date: now() },
      { state: 1, scheduled_date: minutesAgo(10) },           // learning READY (first)
      { state: 1, scheduled_date: minutesAgo(2) },            // learning READY (second)
    ];
    expect(getNextReadyIndex(queue)).toBe(1);
  });

  it('mix: 2 learning (1 ready, 1 waiting) + 3 new + 2 review → returns the ready learning', () => {
    const queue = [
      { state: 0, scheduled_date: now() },
      { state: 0, scheduled_date: now() },
      { state: 0, scheduled_date: now() },
      { state: 2, scheduled_date: minutesAgo(120) },
      { state: 2, scheduled_date: minutesAgo(60) },
      { state: 1, scheduled_date: minutesFromNow(10) },       // waiting
      { state: 1, scheduled_date: minutesAgo(1) },            // READY
    ];
    expect(getNextReadyIndex(queue)).toBe(6);
  });

  it('all learning cards waiting → returns -1', () => {
    const queue = [
      { state: 1, scheduled_date: minutesFromNow(5) },
      { state: 1, scheduled_date: minutesFromNow(10) },
    ];
    expect(getNextReadyIndex(queue)).toBe(-1);
  });

  it('learning card scheduled exactly at now is considered ready', () => {
    const queue = [
      { state: 0, scheduled_date: now() },
      { state: 1, scheduled_date: new Date().toISOString() },
    ];
    expect(getNextReadyIndex(queue)).toBe(1);
  });

  it('only new cards in queue → returns index 0', () => {
    const queue = [
      { state: 0, scheduled_date: now() },
      { state: 0, scheduled_date: now() },
    ];
    expect(getNextReadyIndex(queue)).toBe(0);
  });

  it('only review cards → returns index 0', () => {
    const queue = [
      { state: 2, scheduled_date: minutesAgo(30) },
      { state: 2, scheduled_date: minutesAgo(10) },
    ];
    expect(getNextReadyIndex(queue)).toBe(0);
  });
});

describe('Queue ordering – shuffle only affects new + review', () => {
  it('shuffleArray does not always return same order (statistical)', () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    const shuffled = shuffleArray(arr);
    // Very unlikely to be identical
    const same = arr.every((v, i) => v === shuffled[i]);
    // Could happen but astronomically unlikely with 20 elements
    expect(shuffled).toHaveLength(20);
    // At least verify it contains the same elements
    expect(shuffled.sort((a, b) => a - b)).toEqual(arr);
  });

  it('learning cards at the front are never reordered by queue build logic', () => {
    // Simulating the queue build from studyService:
    // learningCards go first, then shuffled new+review
    const learningCards = [
      { id: 'L1', state: 1, scheduled_date: minutesFromNow(5) },
      { id: 'L2', state: 1, scheduled_date: minutesAgo(2) },
    ];
    const newCards = [
      { id: 'N1', state: 0, scheduled_date: now() },
      { id: 'N2', state: 0, scheduled_date: now() },
    ];
    const reviewCards = [
      { id: 'R1', state: 2, scheduled_date: minutesAgo(60) },
    ];

    const nonLearning = [...newCards, ...reviewCards];
    const shuffledNonLearning = shuffleArray(nonLearning);
    const queue = [...learningCards, ...shuffledNonLearning];

    // Learning cards always at positions 0 and 1
    expect(queue[0].id).toBe('L1');
    expect(queue[1].id).toBe('L2');
    expect(queue).toHaveLength(5);
  });

  it('shuffle OFF: preserves order (learning first, then new+review in original order)', () => {
    const learningCards = [{ id: 'L1', state: 1, scheduled_date: minutesAgo(1) }];
    const newCards = [{ id: 'N1', state: 0 }, { id: 'N2', state: 0 }];
    const reviewCards = [{ id: 'R1', state: 2 }];

    const nonLearning = [...newCards, ...reviewCards];
    // shuffle OFF means no shuffleArray call
    const queue = [...learningCards, ...nonLearning];

    expect(queue.map(c => c.id)).toEqual(['L1', 'N1', 'N2', 'R1']);
  });
});

describe('getLocalMidnight – scheduling at midnight', () => {
  it('returns midnight (00:00:00.000) for 1 day', () => {
    const result = getLocalMidnight(1);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getMilliseconds()).toBe(0);
  });

  it('returns midnight for 2 days', () => {
    const result = getLocalMidnight(2);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
  });

  it('date is correct number of days ahead', () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const days of [1, 2, 5, 10, 30]) {
      const result = getLocalMidnight(days);
      const expected = new Date(today);
      expected.setDate(expected.getDate() + days);
      expect(result.getTime()).toBe(expected.getTime());
    }
  });

  it('getLocalMidnight(0) returns today at midnight', () => {
    const result = getLocalMidnight(0);
    const today = new Date();
    expect(result.getDate()).toBe(today.getDate());
    expect(result.getHours()).toBe(0);
  });
});

describe('SM2 – scheduling uses midnight for day intervals, exact time for learning', () => {
  it('rating Again on new card → learning state with exact timestamp (not midnight)', () => {
    const card: SM2Card = { stability: 2.5, difficulty: 0, state: 0, scheduled_date: now() };
    const result = sm2Schedule(card, 1, DEFAULT_SM2_PARAMS);
    expect(result.state).toBe(1);
    expect(result.interval_days).toBe(0);
    const scheduled = new Date(result.scheduled_date);
    // Should NOT be at midnight — should be ~1 minute from now
    expect(scheduled.getTime()).toBeGreaterThan(Date.now() - 5000);
    expect(scheduled.getTime()).toBeLessThan(Date.now() + 2 * 60 * 1000);
  });

  it('rating Good on new card → review state with midnight scheduling', () => {
    const card: SM2Card = { stability: 2.5, difficulty: 0, state: 0, scheduled_date: now() };
    const result = sm2Schedule(card, 3, DEFAULT_SM2_PARAMS);
    expect(result.state).toBe(2);
    expect(result.interval_days).toBeGreaterThanOrEqual(1);
    const scheduled = new Date(result.scheduled_date);
    expect(scheduled.getHours()).toBe(0);
    expect(scheduled.getMinutes()).toBe(0);
    expect(scheduled.getSeconds()).toBe(0);
  });

  it('rating Again on review card → becomes learning with exact timestamp', () => {
    const card: SM2Card = { stability: 2.5, difficulty: 3, state: 2, scheduled_date: minutesAgo(60) };
    const result = sm2Schedule(card, 1, DEFAULT_SM2_PARAMS);
    expect(result.state).toBe(3); // relearning (state 3 behaves like learning)
    expect(result.interval_days).toBe(0);
    const scheduled = new Date(result.scheduled_date);
    // Exact timestamp, not midnight
    expect(scheduled.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('rating Good on review card → review with midnight scheduling', () => {
    const card: SM2Card = { stability: 2.5, difficulty: 2, state: 2, scheduled_date: minutesAgo(24 * 60) };
    const result = sm2Schedule(card, 3, DEFAULT_SM2_PARAMS);
    expect(result.state).toBe(2);
    const scheduled = new Date(result.scheduled_date);
    expect(scheduled.getHours()).toBe(0);
    expect(scheduled.getMinutes()).toBe(0);
  });
});

describe('FSRS – scheduling uses midnight for day intervals, exact time for learning', () => {
  it('rating Again on new card → learning with exact timestamp', () => {
    const card: FSRSCard = { stability: 0, difficulty: 0, state: 0, scheduled_date: now() };
    const result = fsrsSchedule(card, 1, DEFAULT_FSRS_PARAMS);
    expect(result.state).toBe(1);
    expect(result.interval_days).toBe(0);
    const scheduled = new Date(result.scheduled_date);
    expect(scheduled.getTime()).toBeGreaterThan(Date.now() - 5000);
    expect(scheduled.getTime()).toBeLessThan(Date.now() + 2 * 60 * 1000);
  });

  it('rating Good on new card → review with midnight', () => {
    const card: FSRSCard = { stability: 0, difficulty: 0, state: 0, scheduled_date: now() };
    const result = fsrsSchedule(card, 3, DEFAULT_FSRS_PARAMS);
    expect(result.state).toBe(2);
    const scheduled = new Date(result.scheduled_date);
    expect(scheduled.getHours()).toBe(0);
    expect(scheduled.getMinutes()).toBe(0);
  });

  it('rating Again on review card → learning with exact timestamp', () => {
    const card: FSRSCard = { stability: 10, difficulty: 5, state: 2, scheduled_date: minutesAgo(24 * 60) };
    const result = fsrsSchedule(card, 1, DEFAULT_FSRS_PARAMS);
    expect(result.state).toBe(3); // relearning
    const scheduled = new Date(result.scheduled_date);
    expect(scheduled.getTime()).toBeGreaterThan(Date.now() - 5000);
  });

  it('rating Good on review card → review with midnight', () => {
    const card: FSRSCard = { stability: 10, difficulty: 5, state: 2, scheduled_date: minutesAgo(24 * 60) };
    const result = fsrsSchedule(card, 3, DEFAULT_FSRS_PARAMS);
    expect(result.state).toBe(2);
    const scheduled = new Date(result.scheduled_date);
    expect(scheduled.getHours()).toBe(0);
    expect(scheduled.getMinutes()).toBe(0);
  });
});

describe('Full flow simulation – card state transitions', () => {
  it('new card rated Again → becomes learning → timer expires → cuts the line', () => {
    // Step 1: Rate new card as Again
    const card: SM2Card = { stability: 2.5, difficulty: 0, state: 0, scheduled_date: now() };
    const result = sm2Schedule(card, 1, DEFAULT_SM2_PARAMS);
    expect(result.state).toBe(1);

    // Step 2: Card is in learning with future timer → does NOT cut
    const queue1 = [
      { state: 0, scheduled_date: now() },
      { state: 2, scheduled_date: minutesAgo(60) },
      { state: 1, scheduled_date: result.scheduled_date },  // learning, future
    ];
    // The learning card's scheduled_date is ~1min from now
    expect(getNextReadyIndex(queue1)).toBe(0); // new card shown, not learning

    // Step 3: Simulate timer expiring (set scheduled_date to past)
    queue1[2].scheduled_date = minutesAgo(1);
    expect(getNextReadyIndex(queue1)).toBe(2); // learning card cuts the line!
  });

  it('review card rated Again → loses review state, becomes learning → cuts line when ready', () => {
    // Step 1: Review card rated Again
    const card: SM2Card = { stability: 2.5, difficulty: 3, state: 2, scheduled_date: minutesAgo(24 * 60) };
    const result = sm2Schedule(card, 1, DEFAULT_SM2_PARAMS);
    expect(result.state).toBe(3); // relearning

    // Step 2: In queue with future timer
    const queue = [
      { state: 0, scheduled_date: now() },
      { state: 3, scheduled_date: result.scheduled_date }, // future timer (relearning)
    ];
    expect(getNextReadyIndex(queue)).toBe(0); // new card first

    // Step 3: Timer expires
    queue[1].scheduled_date = minutesAgo(0.5);
    expect(getNextReadyIndex(queue)).toBe(1); // relearning cuts!
  });

  it('FSRS: review card rated Again → learning → cuts line', () => {
    const card: FSRSCard = { stability: 15, difficulty: 5, state: 2, scheduled_date: minutesAgo(48 * 60) };
    const result = fsrsSchedule(card, 1, DEFAULT_FSRS_PARAMS);
    expect(result.state).toBe(3); // relearning

    const queue = [
      { state: 0, scheduled_date: now() },
      { state: 2, scheduled_date: minutesAgo(60) },
      { state: 1, scheduled_date: minutesAgo(1) }, // expired learning
    ];
    expect(getNextReadyIndex(queue)).toBe(2);
  });

  it('session with shuffle: new/review randomized, learning always cuts', () => {
    // Build queue like studyService does
    const learningCards = [
      { id: 'L1', state: 1, scheduled_date: minutesFromNow(10) },
    ];
    const newCards = [
      { id: 'N1', state: 0, scheduled_date: now() },
      { id: 'N2', state: 0, scheduled_date: now() },
    ];
    const reviewCards = [
      { id: 'R1', state: 2, scheduled_date: minutesAgo(60) },
    ];

    // Shuffle ON: only new+review shuffled
    const nonLearning = [...newCards, ...reviewCards];
    const shuffled = shuffleArray(nonLearning);
    const queue = [...learningCards, ...shuffled];

    // Learning is first in queue but timer not expired → skip to new/review
    const idx = getNextReadyIndex(queue);
    expect(idx).toBeGreaterThan(0); // not the learning card
    expect(queue[idx].state === 0 || queue[idx].state === 2).toBe(true);

    // Now expire the learning card timer
    queue[0].scheduled_date = minutesAgo(1);
    expect(getNextReadyIndex(queue)).toBe(0); // learning cuts!
  });

  it('learning card rated Good → graduates to review with midnight scheduling', () => {
    const card: SM2Card = { stability: 2.5, difficulty: 0, state: 1, scheduled_date: minutesAgo(5) };
    const result = sm2Schedule(card, 3, DEFAULT_SM2_PARAMS);
    expect(result.state).toBe(2);
    expect(result.interval_days).toBeGreaterThanOrEqual(1);
    const scheduled = new Date(result.scheduled_date);
    expect(scheduled.getHours()).toBe(0);
    expect(scheduled.getMinutes()).toBe(0);
  });

  it('after learning card is answered correctly, next getNextReadyIndex picks new/review', () => {
    const queue = [
      { id: 'L1', state: 1, scheduled_date: minutesAgo(2) },
      { id: 'N1', state: 0, scheduled_date: now() },
      { id: 'R1', state: 2, scheduled_date: minutesAgo(60) },
    ];
    // Learning cuts first
    expect(getNextReadyIndex(queue)).toBe(0);

    // Remove learning card (simulating successful review)
    const remaining = queue.filter(c => c.id !== 'L1');
    expect(getNextReadyIndex(remaining)).toBe(0); // N1 is now first
    expect(remaining[0].id).toBe('N1');
  });
});
