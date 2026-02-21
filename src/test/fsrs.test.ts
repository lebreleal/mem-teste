import { describe, it, expect } from 'vitest';
import { fsrsSchedule, type FSRSCard, type FSRSParams, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';

function makeCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    stability: 0,
    difficulty: 0,
    state: 0,
    scheduled_date: new Date().toISOString(),
    ...overrides,
  };
}

function daysFromNow(result: { scheduled_date: string }): number {
  const diff = new Date(result.scheduled_date).getTime() - Date.now();
  return Math.round(diff / 86400000);
}

function minutesFromNow(result: { scheduled_date: string }): number {
  const diff = new Date(result.scheduled_date).getTime() - Date.now();
  return Math.round(diff / 60000);
}

const params: FSRSParams = { ...DEFAULT_FSRS_PARAMS };

describe('FSRS Algorithm - New Cards (state=0)', () => {
  it('1. Again on new card → learning, 1min step', () => {
    const r = fsrsSchedule(makeCard(), 1, params);
    expect(r.state).toBe(1);
    expect(r.interval_days).toBe(0);
    expect(minutesFromNow(r)).toBeCloseTo(1, 0);
  });

  it('2. Hard on new card → learning, 10min step', () => {
    const r = fsrsSchedule(makeCard(), 2, params);
    expect(r.state).toBe(1);
    expect(r.interval_days).toBe(0);
    expect(minutesFromNow(r)).toBeCloseTo(10, 0);
  });

  it('3. Good on new card → review', () => {
    const r = fsrsSchedule(makeCard(), 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('4. Easy on new card → review with >= 4d', () => {
    const r = fsrsSchedule(makeCard(), 4, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(4);
  });

  it('5. Stability initialized from w[rating-1]', () => {
    const r = fsrsSchedule(makeCard(), 3, params);
    expect(r.stability).toBeCloseTo(DEFAULT_FSRS_PARAMS.w[2], 1); // w[2] = 2.4
  });

  it('6. Difficulty initialized correctly', () => {
    const r = fsrsSchedule(makeCard(), 3, params);
    expect(r.difficulty).toBeGreaterThanOrEqual(1);
    expect(r.difficulty).toBeLessThanOrEqual(10);
  });

  it('7. Higher rating → lower difficulty on new card', () => {
    const rAgain = fsrsSchedule(makeCard(), 1, params);
    const rEasy = fsrsSchedule(makeCard(), 4, params);
    expect(rEasy.difficulty).toBeLessThan(rAgain.difficulty);
  });

  it('8. Higher rating → higher stability on new card', () => {
    const rAgain = fsrsSchedule(makeCard(), 1, params);
    const rEasy = fsrsSchedule(makeCard(), 4, params);
    expect(rEasy.stability).toBeGreaterThan(rAgain.stability);
  });

  it('9. Custom learning steps respected', () => {
    const p = { ...params, learningSteps: [5, 30] };
    const r = fsrsSchedule(makeCard(), 1, p);
    expect(minutesFromNow(r)).toBeCloseTo(5, 0);
  });

  it('10. Custom learning steps - Hard uses second', () => {
    const p = { ...params, learningSteps: [5, 30] };
    const r = fsrsSchedule(makeCard(), 2, p);
    expect(minutesFromNow(r)).toBeCloseTo(30, 0);
  });
});

describe('FSRS Algorithm - Learning Cards (state=1)', () => {
  const learningCard = makeCard({ state: 1, stability: 2.4, difficulty: 5.0 });

  it('11. Again on learning → stay learning, halved stability', () => {
    const r = fsrsSchedule(learningCard, 1, params);
    expect(r.state).toBe(1);
    expect(r.stability).toBeLessThan(learningCard.stability);
    expect(r.stability).toBeGreaterThanOrEqual(0.1);
  });

  it('12. Hard on learning → stay learning', () => {
    const r = fsrsSchedule(learningCard, 2, params);
    expect(r.state).toBe(1);
    expect(r.interval_days).toBe(0);
  });

  it('13. Good on learning → graduate to review', () => {
    const r = fsrsSchedule(learningCard, 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('14. Easy on learning → graduate with >= 4d', () => {
    const r = fsrsSchedule(learningCard, 4, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(4);
  });

  it('15. Difficulty updated on learning review', () => {
    const r = fsrsSchedule(learningCard, 1, params);
    expect(r.difficulty).not.toBe(learningCard.difficulty);
  });
});

describe('FSRS Algorithm - Review Cards (state=2)', () => {
  it('16. Again on review → relearning (state=1)', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 1, params);
    expect(r.state).toBe(3); // relearning state
    expect(r.interval_days).toBe(0);
  });

  it('17. Good on review → stay review, interval grows', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThan(10);
  });

  it('18. Hard on review → interval >= current', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 2, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(10);
  });

  it('19. Easy on review → longest interval', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const rGood = fsrsSchedule(card, 3, params);
    const rEasy = fsrsSchedule(card, 4, params);
    expect(rEasy.interval_days).toBeGreaterThanOrEqual(rGood.interval_days);
  });

  it('20. Interval ordering: Hard <= Good <= Easy', () => {
    const card = makeCard({ state: 2, stability: 15, difficulty: 5, scheduled_date: new Date(Date.now() - 15 * 86400000).toISOString() });
    const rHard = fsrsSchedule(card, 2, params);
    const rGood = fsrsSchedule(card, 3, params);
    const rEasy = fsrsSchedule(card, 4, params);
    expect(rHard.interval_days).toBeLessThanOrEqual(rGood.interval_days);
    expect(rGood.interval_days).toBeLessThanOrEqual(rEasy.interval_days);
  });

  it('21. Stability increases on recall (Good)', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 3, params);
    expect(r.stability).toBeGreaterThan(card.stability);
  });

  it('22. Stability decreases on lapse (Again)', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 1, params);
    expect(r.stability).toBeLessThan(card.stability);
  });

  it('23. Difficulty decreases on Easy', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 7, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 4, params);
    expect(r.difficulty).toBeLessThan(7);
  });

  it('24. Difficulty increases on Again', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 1, params);
    expect(r.difficulty).toBeGreaterThan(5);
  });

  it('25. Difficulty clamped to [1, 10]', () => {
    const cardEasy = makeCard({ state: 2, stability: 10, difficulty: 1.5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const rEasy = fsrsSchedule(cardEasy, 4, params);
    expect(rEasy.difficulty).toBeGreaterThanOrEqual(1);

    const cardHard = makeCard({ state: 2, stability: 10, difficulty: 9.5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const rHard = fsrsSchedule(cardHard, 1, params);
    expect(rHard.difficulty).toBeLessThanOrEqual(10);
  });

  it('26. Maximum interval respected', () => {
    const p = { ...params, maximumInterval: 30 };
    const card = makeCard({ state: 2, stability: 100, difficulty: 3, scheduled_date: new Date(Date.now() - 100 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 4, p);
    expect(r.interval_days).toBeLessThanOrEqual(30);
  });

  it('27. Requested retention affects intervals', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const rHigh = fsrsSchedule(card, 3, { ...params, requestedRetention: 0.95 });
    const rLow = fsrsSchedule(card, 3, { ...params, requestedRetention: 0.80 });
    expect(rLow.interval_days).toBeGreaterThan(rHigh.interval_days);
  });

  it('28. Hard penalty applied (w[15])', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const rHard = fsrsSchedule(card, 2, params);
    const rGood = fsrsSchedule(card, 3, params);
    // Hard stability should be less than Good stability
    expect(rHard.stability).toBeLessThanOrEqual(rGood.stability);
  });

  it('29. Easy bonus applied (w[16])', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    const rGood = fsrsSchedule(card, 3, params);
    const rEasy = fsrsSchedule(card, 4, params);
    expect(rEasy.stability).toBeGreaterThanOrEqual(rGood.stability);
  });

  it('30. Long progression: stability and intervals grow', () => {
    let card = makeCard();
    let r = fsrsSchedule(card, 3, params);
    card = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: r.scheduled_date };
    
    let prevInterval = r.interval_days;
    let prevStability = r.stability;
    
    for (let i = 0; i < 8; i++) {
      const pastDate = new Date(Date.now() - prevInterval * 86400000).toISOString();
      card.scheduled_date = pastDate;
      r = fsrsSchedule(card, 3, params);
      
      expect(r.stability).toBeGreaterThan(prevStability);
      expect(r.interval_days).toBeGreaterThanOrEqual(prevInterval);
      
      prevInterval = r.interval_days;
      prevStability = r.stability;
      card = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: r.scheduled_date };
    }
  });

  it('31. Overdue card (elapsed >> stability) still works', () => {
    const card = makeCard({ state: 2, stability: 5, difficulty: 5, scheduled_date: new Date(Date.now() - 60 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
    expect(r.stability).toBeGreaterThan(0);
  });

  it('32. Forget stability always >= 0.1', () => {
    const card = makeCard({ state: 2, stability: 0.5, difficulty: 9, scheduled_date: new Date(Date.now() - 86400000).toISOString() });
    const r = fsrsSchedule(card, 1, params);
    expect(r.stability).toBeGreaterThanOrEqual(0.1);
  });
});
