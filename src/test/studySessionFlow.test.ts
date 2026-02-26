/**
 * Integration tests: study session queue logic + FSRS scheduling.
 * Validates that cards only reappear when their scheduled time allows it.
 */
import { describe, it, expect } from 'vitest';
import { fsrsSchedule, type FSRSCard, type FSRSParams, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';
import { getNextReadyIndex, shouldKeepInSession, applyReviewToQueue } from '@/lib/studyUtils';

const params: FSRSParams = { ...DEFAULT_FSRS_PARAMS };

type QueueCard = FSRSCard & { id: string };

function makeQueueCard(id: string, overrides: Partial<FSRSCard> = {}): QueueCard {
  return {
    id,
    stability: 0,
    difficulty: 0,
    state: 0,
    scheduled_date: new Date().toISOString(),
    learning_step: 0,
    ...overrides,
  };
}

/** Simulate a review: schedule + apply to queue, return new queue + result */
function reviewCard(queue: QueueCard[], cardId: string, rating: 1|2|3|4, p = params) {
  const card = queue.find(c => c.id === cardId)!;
  const result = fsrsSchedule(card, rating, p);
  const newQueue = applyReviewToQueue(queue, cardId, result);
  return { queue: newQueue, result };
}

// ═══════════════════════════════════════════════════════════════
// shouldKeepInSession unit tests
// ═══════════════════════════════════════════════════════════════
describe('shouldKeepInSession', () => {
  it('1. interval_days=0 → keep', () => {
    expect(shouldKeepInSession({ interval_days: 0 })).toBe(true);
  });
  it('2. interval_days=1 → remove', () => {
    expect(shouldKeepInSession({ interval_days: 1 })).toBe(false);
  });
  it('3. interval_days=10 → remove', () => {
    expect(shouldKeepInSession({ interval_days: 10 })).toBe(false);
  });
  it('4. interval_days=0 (learning) → keep', () => {
    expect(shouldKeepInSession({ interval_days: 0 })).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// applyReviewToQueue unit tests
// ═══════════════════════════════════════════════════════════════
describe('applyReviewToQueue', () => {
  it('5. Removes card when interval > 0', () => {
    const queue = [makeQueueCard('a'), makeQueueCard('b')];
    const result = { interval_days: 5, state: 2, stability: 10, difficulty: 5, scheduled_date: new Date().toISOString() };
    const newQ = applyReviewToQueue(queue, 'a', result);
    expect(newQ.length).toBe(1);
    expect(newQ[0].id).toBe('b');
  });

  it('6. Keeps card when interval=0, moves to end', () => {
    const queue = [makeQueueCard('a'), makeQueueCard('b'), makeQueueCard('c')];
    const result = { interval_days: 0, state: 1, stability: 1, difficulty: 5, scheduled_date: new Date(Date.now() + 60000).toISOString() };
    const newQ = applyReviewToQueue(queue, 'a', result);
    expect(newQ.length).toBe(3);
    expect(newQ[2].id).toBe('a');
    expect(newQ[2].state).toBe(1);
  });

  it('7. Card not in queue → returns same queue', () => {
    const queue = [makeQueueCard('a')];
    const result = { interval_days: 0, state: 1, stability: 1, difficulty: 5, scheduled_date: new Date().toISOString() };
    const newQ = applyReviewToQueue(queue, 'z', result);
    expect(newQ.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// REGRESSION: Hard on review must NOT stay in session
// ═══════════════════════════════════════════════════════════════
describe('Regression: Hard on review card', () => {
  it('8. Review card + Hard (2) → removed from queue (interval > 0)', () => {
    const card = makeQueueCard('review1', { state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const queue = [card];
    const { queue: newQ, result } = reviewCard(queue, 'review1', 2);
    expect(result.interval_days).toBeGreaterThan(0);
    expect(newQ.length).toBe(0); // MUST be removed
  });

  it('9. Review card + Hard → state stays 2 (review)', () => {
    const card = makeQueueCard('review2', { state: 2, stability: 15, difficulty: 5, scheduled_date: new Date(Date.now() - 15 * 86400000).toISOString() });
    const { result } = reviewCard([card], 'review2', 2);
    expect(result.state).toBe(2);
    expect(result.interval_days).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Full session flow scenarios
// ═══════════════════════════════════════════════════════════════
describe('Session Flow: New card scenarios', () => {
  it('10. New → Again: stays in queue (learning step)', () => {
    const queue = [makeQueueCard('c1')];
    const { queue: q1, result } = reviewCard(queue, 'c1', 1);
    expect(result.state).toBe(1);
    expect(result.interval_days).toBe(0);
    expect(q1.length).toBe(1);
  });

  it('11. New → Again → Again: still in queue', () => {
    let q = [makeQueueCard('c1')];
    ({ queue: q } = reviewCard(q, 'c1', 1));
    ({ queue: q } = reviewCard(q, 'c1', 1));
    expect(q.length).toBe(1);
    expect(q[0].state).toBe(1);
  });

  it('12. New → Again → Good: graduates, removed from queue', () => {
    let q = [makeQueueCard('c1')];
    ({ queue: q } = reviewCard(q, 'c1', 1));
    const { queue: final, result } = reviewCard(q, 'c1', 3);
    expect(result.state).toBe(2);
    expect(result.interval_days).toBeGreaterThanOrEqual(1);
    expect(final.length).toBe(0);
  });

  it('13. New → Again → Again → Good: graduates after double fail', () => {
    let q = [makeQueueCard('c1')];
    ({ queue: q } = reviewCard(q, 'c1', 1));
    ({ queue: q } = reviewCard(q, 'c1', 1));
    const { queue: final, result } = reviewCard(q, 'c1', 3);
    expect(result.state).toBe(2);
    expect(final.length).toBe(0);
  });

  it('14. New → Again → Easy: fast graduation', () => {
    let q = [makeQueueCard('c1')];
    ({ queue: q } = reviewCard(q, 'c1', 1));
    const { queue: final, result } = reviewCard(q, 'c1', 4);
    expect(result.state).toBe(2);
    expect(result.interval_days).toBeGreaterThanOrEqual(4);
    expect(final.length).toBe(0);
  });

  it('15. New → Good: immediate graduation, removed', () => {
    const q = [makeQueueCard('c1')];
    const { queue: final } = reviewCard(q, 'c1', 3);
    expect(final.length).toBe(0);
  });

  it('16. New → Easy: immediate graduation, removed', () => {
    const q = [makeQueueCard('c1')];
    const { queue: final } = reviewCard(q, 'c1', 4);
    expect(final.length).toBe(0);
  });

  it('17. New → Hard: stays learning (interval=0)', () => {
    const q = [makeQueueCard('c1')];
    const { queue: final, result } = reviewCard(q, 'c1', 2);
    expect(result.state).toBe(1);
    expect(result.interval_days).toBe(0);
    expect(final.length).toBe(1);
  });
});

describe('Session Flow: Review card scenarios', () => {
  const makeReview = (id: string) =>
    makeQueueCard(id, { state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });

  it('18. Review → Good: removed', () => {
    const { queue: q } = reviewCard([makeReview('r1')], 'r1', 3);
    expect(q.length).toBe(0);
  });

  it('19. Review → Easy: removed', () => {
    const { queue: q } = reviewCard([makeReview('r1')], 'r1', 4);
    expect(q.length).toBe(0);
  });

  it('20. Review → Hard: removed (interval > 0)', () => {
    const { queue: q, result } = reviewCard([makeReview('r1')], 'r1', 2);
    expect(result.interval_days).toBeGreaterThan(0);
    expect(q.length).toBe(0);
  });

  it('21. Review → Again: stays (relearning, interval=0)', () => {
    const { queue: q, result } = reviewCard([makeReview('r1')], 'r1', 1);
    expect(result.state).toBe(3);
    expect(result.interval_days).toBe(0);
    expect(q.length).toBe(1);
  });

  it('22. Review → Again → Good: re-graduates, removed', () => {
    let q: QueueCard[] = [makeReview('r1')];
    ({ queue: q } = reviewCard(q, 'r1', 1));
    expect(q.length).toBe(1);
    const { queue: final } = reviewCard(q, 'r1', 3);
    expect(final.length).toBe(0);
  });

  it('23. Review → Again → Again → Good: double relearn then graduate', () => {
    let q: QueueCard[] = [makeReview('r1')];
    ({ queue: q } = reviewCard(q, 'r1', 1));
    ({ queue: q } = reviewCard(q, 'r1', 1));
    expect(q.length).toBe(1);
    const { queue: final } = reviewCard(q, 'r1', 3);
    expect(final.length).toBe(0);
  });

  it('24. Review → Again → Hard: stays relearning', () => {
    let q: QueueCard[] = [makeReview('r1')];
    ({ queue: q } = reviewCard(q, 'r1', 1));
    const { queue: final, result } = reviewCard(q, 'r1', 2);
    expect(result.state).toBe(3);
    expect(result.interval_days).toBe(0);
    expect(final.length).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// getNextReadyIndex integration
// ═══════════════════════════════════════════════════════════════
describe('getNextReadyIndex integration', () => {
  it('25. Learning card with future timer → returns -1', () => {
    const queue = [{ state: 1, scheduled_date: new Date(Date.now() + 60000).toISOString() }];
    expect(getNextReadyIndex(queue)).toBe(-1);
  });

  it('26. Learning card with expired timer → returns its index', () => {
    const queue = [{ state: 1, scheduled_date: new Date(Date.now() - 1000).toISOString() }];
    expect(getNextReadyIndex(queue)).toBe(0);
  });

  it('27. New card available → returns its index', () => {
    const queue = [{ state: 0, scheduled_date: new Date().toISOString() }];
    expect(getNextReadyIndex(queue)).toBe(0);
  });

  it('28. Review card available → returns its index', () => {
    const queue = [{ state: 2, scheduled_date: new Date().toISOString() }];
    expect(getNextReadyIndex(queue)).toBe(0);
  });

  it('29. Learning expired cuts in front of review', () => {
    const queue = [
      { state: 2, scheduled_date: new Date().toISOString() },
      { state: 1, scheduled_date: new Date(Date.now() - 1000).toISOString() },
    ];
    expect(getNextReadyIndex(queue)).toBe(1);
  });

  it('30. Relearning (state=3) expired cuts in front', () => {
    const queue = [
      { state: 0, scheduled_date: new Date().toISOString() },
      { state: 3, scheduled_date: new Date(Date.now() - 1000).toISOString() },
    ];
    expect(getNextReadyIndex(queue)).toBe(1);
  });

  it('31. Multiple learning cards: picks first expired', () => {
    const queue = [
      { state: 1, scheduled_date: new Date(Date.now() + 60000).toISOString() },
      { state: 1, scheduled_date: new Date(Date.now() - 5000).toISOString() },
    ];
    expect(getNextReadyIndex(queue)).toBe(1);
  });

  it('32. All learning future → -1', () => {
    const queue = [
      { state: 1, scheduled_date: new Date(Date.now() + 60000).toISOString() },
      { state: 3, scheduled_date: new Date(Date.now() + 120000).toISOString() },
    ];
    expect(getNextReadyIndex(queue)).toBe(-1);
  });

  it('33. Empty queue → -1', () => {
    expect(getNextReadyIndex([])).toBe(-1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Multi-card session scenarios
// ═══════════════════════════════════════════════════════════════
describe('Multi-card session', () => {
  it('34. Two new cards: first fails, second succeeds → queue has 1', () => {
    let q = [makeQueueCard('a'), makeQueueCard('b')];
    ({ queue: q } = reviewCard(q, 'a', 1));
    ({ queue: q } = reviewCard(q, 'b', 3));
    expect(q.length).toBe(1);
    expect(q[0].id).toBe('a');
  });

  it('35. Three cards: all Good → empty queue', () => {
    let q = [makeQueueCard('a'), makeQueueCard('b'), makeQueueCard('c')];
    ({ queue: q } = reviewCard(q, 'a', 3));
    ({ queue: q } = reviewCard(q, 'b', 3));
    ({ queue: q } = reviewCard(q, 'c', 3));
    expect(q.length).toBe(0);
  });

  it('36. Mix: new fails, review succeeds, new succeeds', () => {
    let q: QueueCard[] = [
      makeQueueCard('new1'),
      makeQueueCard('rev1', { state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() }),
      makeQueueCard('new2'),
    ];
    ({ queue: q } = reviewCard(q, 'new1', 1));
    ({ queue: q } = reviewCard(q, 'rev1', 3));
    ({ queue: q } = reviewCard(q, 'new2', 3));
    expect(q.length).toBe(1);
    expect(q[0].id).toBe('new1');
  });

  it('37. Review Hard removes, new Again keeps', () => {
    let q: QueueCard[] = [
      makeQueueCard('rev1', { state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() }),
      makeQueueCard('new1'),
    ];
    ({ queue: q } = reviewCard(q, 'rev1', 2)); // Hard on review → removed
    expect(q.length).toBe(1);
    expect(q[0].id).toBe('new1');
    ({ queue: q } = reviewCard(q, 'new1', 1)); // Again on new → kept
    expect(q.length).toBe(1);
    expect(q[0].id).toBe('new1');
  });
});

// ═══════════════════════════════════════════════════════════════
// Custom deck config scenarios
// ═══════════════════════════════════════════════════════════════
describe('Custom deck configs', () => {
  it('38. Steps [5, 30]: Again stays with 5min step', () => {
    const p = { ...params, learningSteps: [5, 30] };
    const q = [makeQueueCard('c1')];
    const { queue: q1, result } = reviewCard(q, 'c1', 1, p);
    expect(q1.length).toBe(1);
    expect(result.interval_days).toBe(0);
  });

  it('39. Steps [1, 15]: Hard stays with 15min', () => {
    const p = { ...params, learningSteps: [1, 15] };
    const q = [makeQueueCard('c1')];
    const { queue: q1, result } = reviewCard(q, 'c1', 2, p);
    expect(q1.length).toBe(1);
    expect(result.interval_days).toBe(0);
  });

  it('40. Relearning steps [5, 20]: Again on review → 5min relearning step', () => {
    const p = { ...params, relearningSteps: [5, 20] };
    const card = makeQueueCard('r1', { state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const { queue: q, result } = reviewCard([card], 'r1', 1, p);
    expect(result.state).toBe(3);
    expect(result.interval_days).toBe(0);
    expect(q.length).toBe(1);
  });
});
