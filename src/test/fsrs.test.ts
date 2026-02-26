import { describe, it, expect } from 'vitest';
import { fsrsSchedule, type FSRSCard, type FSRSParams, DEFAULT_FSRS_PARAMS } from '@/lib/fsrs';

function makeCard(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return {
    stability: 0,
    difficulty: 0,
    state: 0,
    scheduled_date: new Date().toISOString(),
    learning_step: 0,
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

// Helper to advance a card through a sequence of ratings
function simulate(ratings: (1|2|3|4)[], p: FSRSParams = params): { stability: number; difficulty: number; state: number; interval_days: number; scheduled_date: string; learning_step: number }[] {
  let card = makeCard();
  const results: any[] = [];
  for (const rating of ratings) {
    const r = fsrsSchedule(card, rating, p);
    results.push(r);
    // Simulate time passing: set scheduled_date in the past by interval_days
    const nextScheduled = r.interval_days > 0
      ? new Date(Date.now() - r.interval_days * 86400000).toISOString()
      : r.scheduled_date; // for learning steps, keep as-is (pretend timer expired)
    card = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: nextScheduled, learning_step: r.learning_step };
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// BLOCK A: New Cards (state=0) — with Anki-compatible learning steps
// ═══════════════════════════════════════════════════════════════
describe('FSRS – New Cards (state=0)', () => {
  it('1. Again → learning step 0, 1min', () => {
    const r = fsrsSchedule(makeCard(), 1, params);
    expect(r.state).toBe(1);
    expect(r.interval_days).toBe(0);
    expect(r.learning_step).toBe(0);
    expect(minutesFromNow(r)).toBeCloseTo(1, 0);
  });

  it('2. Hard → learning step 0, avg(step0, step1) ≈ 5.5min', () => {
    const r = fsrsSchedule(makeCard(), 2, params);
    expect(r.state).toBe(1);
    expect(r.interval_days).toBe(0);
    expect(r.learning_step).toBe(0);
    // Default steps [1, 10], avg = 5.5
    expect(minutesFromNow(r)).toBeCloseTo(5.5, 0);
  });

  it('3. Good → learning step 1 (stays learning), 10min', () => {
    const r = fsrsSchedule(makeCard(), 3, params);
    expect(r.state).toBe(1);
    expect(r.interval_days).toBe(0);
    expect(r.learning_step).toBe(1);
    expect(minutesFromNow(r)).toBeCloseTo(10, 0);
  });

  it('4. Easy → graduates directly with >= 4d', () => {
    const r = fsrsSchedule(makeCard(), 4, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(4);
    expect(r.learning_step).toBe(0);
  });

  it('5. Good with single step [5] → graduates', () => {
    const p = { ...params, learningSteps: [5] };
    const r = fsrsSchedule(makeCard(), 3, p);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('6. Stability initialized from w[rating-1]', () => {
    const r = fsrsSchedule(makeCard(), 3, params);
    expect(r.stability).toBeCloseTo(DEFAULT_FSRS_PARAMS.w[2], 1);
  });

  it('7. Difficulty in [1, 10]', () => {
    const r = fsrsSchedule(makeCard(), 3, params);
    expect(r.difficulty).toBeGreaterThanOrEqual(1);
    expect(r.difficulty).toBeLessThanOrEqual(10);
  });

  it('8. Higher rating → lower difficulty', () => {
    const rAgain = fsrsSchedule(makeCard(), 1, params);
    const rEasy = fsrsSchedule(makeCard(), 4, params);
    expect(rEasy.difficulty).toBeLessThan(rAgain.difficulty);
  });

  it('9. Higher rating → higher stability', () => {
    const rAgain = fsrsSchedule(makeCard(), 1, params);
    const rEasy = fsrsSchedule(makeCard(), 4, params);
    expect(rEasy.stability).toBeGreaterThan(rAgain.stability);
  });

  it('10. Custom steps [5, 30] – Again uses 5min', () => {
    const p = { ...params, learningSteps: [5, 30] };
    const r = fsrsSchedule(makeCard(), 1, p);
    expect(minutesFromNow(r)).toBeCloseTo(5, 0);
  });

  it('11. Custom steps [5, 30] – Hard uses avg(5,30) = 17.5min', () => {
    const p = { ...params, learningSteps: [5, 30] };
    const r = fsrsSchedule(makeCard(), 2, p);
    expect(minutesFromNow(r)).toBeCloseTo(17.5, 0);
  });

  it('12. Custom steps [5, 30] – Good uses 30min (step 1)', () => {
    const p = { ...params, learningSteps: [5, 30] };
    const r = fsrsSchedule(makeCard(), 3, p);
    expect(r.state).toBe(1);
    expect(r.learning_step).toBe(1);
    expect(minutesFromNow(r)).toBeCloseTo(30, 0);
  });

  it('13. Single step [5] – Hard uses 5*1.5=7.5min (no next step)', () => {
    const p = { ...params, learningSteps: [5] };
    const r = fsrsSchedule(makeCard(), 2, p);
    // avg(5, 5) = 5 since only one step
    expect(minutesFromNow(r)).toBeCloseTo(5, 0);
  });

  it('14. maxInterval 7 caps new card Easy', () => {
    const p = { ...params, maximumInterval: 7 };
    expect(fsrsSchedule(makeCard(), 4, p).interval_days).toBeLessThanOrEqual(7);
  });

  it('15. Three steps [1, 5, 15] – Good goes to step 1 (5min)', () => {
    const p = { ...params, learningSteps: [1, 5, 15] };
    const r = fsrsSchedule(makeCard(), 3, p);
    expect(r.state).toBe(1);
    expect(r.learning_step).toBe(1);
    expect(minutesFromNow(r)).toBeCloseTo(5, 0);
  });
});

// ═══════════════════════════════════════════════════════════════
// BLOCK B: Learning Cards (state=1) — with step progression
// ═══════════════════════════════════════════════════════════════
describe('FSRS – Learning Cards (state=1)', () => {
  const learningCard = makeCard({ state: 1, stability: 2.4, difficulty: 5.0, learning_step: 0 });

  it('16. Again → stay learning step 0, halved stability', () => {
    const r = fsrsSchedule(learningCard, 1, params);
    expect(r.state).toBe(1);
    expect(r.learning_step).toBe(0);
    expect(r.stability).toBeLessThan(learningCard.stability);
    expect(r.stability).toBeGreaterThanOrEqual(0.1);
  });

  it('17. Hard → stay learning, same step, avg interval', () => {
    const r = fsrsSchedule(learningCard, 2, params);
    expect(r.state).toBe(1);
    expect(r.learning_step).toBe(0);
    expect(r.interval_days).toBe(0);
    // avg(steps[0], steps[1]) = avg(1, 10) = 5.5
    expect(minutesFromNow(r)).toBeCloseTo(5.5, 0);
  });

  it('18. Good on step 0 → advance to step 1', () => {
    const r = fsrsSchedule(learningCard, 3, params);
    expect(r.state).toBe(1);
    expect(r.learning_step).toBe(1);
    expect(minutesFromNow(r)).toBeCloseTo(10, 0);
  });

  it('19. Good on last step → graduate to review', () => {
    const card = makeCard({ state: 1, stability: 2.4, difficulty: 5.0, learning_step: 1 });
    const r = fsrsSchedule(card, 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('20. Easy → graduate with >= 4d regardless of step', () => {
    const r = fsrsSchedule(learningCard, 4, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(4);
  });

  it('21. Difficulty updated on learning review', () => {
    const r = fsrsSchedule(learningCard, 1, params);
    expect(r.difficulty).not.toBe(learningCard.difficulty);
  });

  it('22. Again→Again still learning, stability floors at 0.1', () => {
    let card = learningCard;
    for (let i = 0; i < 5; i++) {
      const r = fsrsSchedule(card, 1, params);
      expect(r.state).toBe(1);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
      card = { ...card, stability: r.stability, difficulty: r.difficulty, learning_step: r.learning_step };
    }
  });

  it('23. Again→Good advances step', () => {
    const r1 = fsrsSchedule(learningCard, 1, params);
    const card2 = { ...learningCard, stability: r1.stability, difficulty: r1.difficulty, scheduled_date: r1.scheduled_date, learning_step: r1.learning_step };
    const r2 = fsrsSchedule(card2, 3, params);
    expect(r2.state).toBe(1);
    expect(r2.learning_step).toBe(1);
  });

  it('24. Again→Good→Good graduates', () => {
    const r1 = fsrsSchedule(learningCard, 1, params);
    const card2 = { ...learningCard, stability: r1.stability, difficulty: r1.difficulty, scheduled_date: r1.scheduled_date, learning_step: r1.learning_step };
    const r2 = fsrsSchedule(card2, 3, params);
    const card3 = { ...card2, stability: r2.stability, difficulty: r2.difficulty, scheduled_date: r2.scheduled_date, learning_step: r2.learning_step };
    const r3 = fsrsSchedule(card3, 3, params);
    expect(r3.state).toBe(2);
    expect(r3.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('25. Custom relearning steps [15] respected', () => {
    const p = { ...params, relearningSteps: [15] };
    const card = makeCard({ state: 3, stability: 5, difficulty: 5, learning_step: 0 });
    const r = fsrsSchedule(card, 1, p);
    expect(minutesFromNow(r)).toBeCloseTo(15, 0);
  });

  it('26. Relearning Good graduates', () => {
    const card = makeCard({ state: 3, stability: 5, difficulty: 5, learning_step: 0 });
    const r = fsrsSchedule(card, 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('27. Three steps [1, 5, 15]: step 0 → Good → step 1 → Good → step 2 → Good → graduate', () => {
    const p = { ...params, learningSteps: [1, 5, 15] };
    const card0 = makeCard({ state: 1, stability: 2, difficulty: 5, learning_step: 0 });
    const r1 = fsrsSchedule(card0, 3, p);
    expect(r1.state).toBe(1);
    expect(r1.learning_step).toBe(1);
    
    const card1 = { ...card0, stability: r1.stability, difficulty: r1.difficulty, scheduled_date: r1.scheduled_date, learning_step: r1.learning_step };
    const r2 = fsrsSchedule(card1, 3, p);
    expect(r2.state).toBe(1);
    expect(r2.learning_step).toBe(2);
    
    const card2 = { ...card1, stability: r2.stability, difficulty: r2.difficulty, scheduled_date: r2.scheduled_date, learning_step: r2.learning_step };
    const r3 = fsrsSchedule(card2, 3, p);
    expect(r3.state).toBe(2); // graduated!
    expect(r3.interval_days).toBeGreaterThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// BLOCK C: Review Cards (state=2) — 20 tests
// ═══════════════════════════════════════════════════════════════
describe('FSRS – Review Cards (state=2)', () => {
  const reviewCard = (s: number, d: number, daysPast: number) =>
    makeCard({ state: 2, stability: s, difficulty: d, scheduled_date: new Date(Date.now() - daysPast * 86400000).toISOString() });

  it('28. Again → relearning (state=3)', () => {
    const r = fsrsSchedule(reviewCard(10, 5, 10), 1, params);
    expect(r.state).toBe(3);
    expect(r.interval_days).toBe(0);
  });

  it('29. Good → stay review, interval grows', () => {
    const r = fsrsSchedule(reviewCard(10, 5, 10), 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThan(10);
  });

  it('30. Hard → interval >= current', () => {
    const r = fsrsSchedule(reviewCard(10, 5, 10), 2, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(10);
  });

  it('31. Easy → longest interval', () => {
    const rGood = fsrsSchedule(reviewCard(10, 5, 10), 3, params);
    const rEasy = fsrsSchedule(reviewCard(10, 5, 10), 4, params);
    expect(rEasy.interval_days).toBeGreaterThanOrEqual(rGood.interval_days);
  });

  it('32. Interval ordering: Hard ≤ Good ≤ Easy', () => {
    const card = reviewCard(15, 5, 15);
    const rH = fsrsSchedule(card, 2, params);
    const rG = fsrsSchedule(card, 3, params);
    const rE = fsrsSchedule(card, 4, params);
    expect(rH.interval_days).toBeLessThanOrEqual(rG.interval_days);
    expect(rG.interval_days).toBeLessThanOrEqual(rE.interval_days);
  });

  it('33. Stability increases on recall (Good)', () => {
    const card = reviewCard(10, 5, 10);
    const r = fsrsSchedule(card, 3, params);
    expect(r.stability).toBeGreaterThan(card.stability);
  });

  it('34. Stability decreases on lapse (Again)', () => {
    const card = reviewCard(10, 5, 10);
    const r = fsrsSchedule(card, 1, params);
    expect(r.stability).toBeLessThan(card.stability);
  });

  it('35. Difficulty decreases on Easy', () => {
    const r = fsrsSchedule(reviewCard(10, 7, 10), 4, params);
    expect(r.difficulty).toBeLessThan(7);
  });

  it('36. Difficulty increases on Again', () => {
    const r = fsrsSchedule(reviewCard(10, 5, 10), 1, params);
    expect(r.difficulty).toBeGreaterThan(5);
  });

  it('37. Difficulty clamped to [1, 10]', () => {
    expect(fsrsSchedule(reviewCard(10, 1.5, 10), 4, params).difficulty).toBeGreaterThanOrEqual(1);
    expect(fsrsSchedule(reviewCard(10, 9.5, 10), 1, params).difficulty).toBeLessThanOrEqual(10);
  });

  it('38. Maximum interval respected', () => {
    const p = { ...params, maximumInterval: 30 };
    const r = fsrsSchedule(reviewCard(100, 3, 100), 4, p);
    expect(r.interval_days).toBeLessThanOrEqual(30);
  });

  it('39. Requested retention affects intervals', () => {
    const card = reviewCard(10, 5, 10);
    const rHigh = fsrsSchedule(card, 3, { ...params, requestedRetention: 0.95 });
    const rLow = fsrsSchedule(card, 3, { ...params, requestedRetention: 0.80 });
    expect(rLow.interval_days).toBeGreaterThan(rHigh.interval_days);
  });

  it('40. Hard penalty (w[15]) → lower stability than Good', () => {
    const card = reviewCard(10, 5, 10);
    expect(fsrsSchedule(card, 2, params).stability).toBeLessThanOrEqual(fsrsSchedule(card, 3, params).stability);
  });

  it('41. Easy bonus (w[16]) → higher stability than Good', () => {
    const card = reviewCard(10, 5, 10);
    expect(fsrsSchedule(card, 4, params).stability).toBeGreaterThanOrEqual(fsrsSchedule(card, 3, params).stability);
  });

  it('42. Long progression: stability and intervals grow', () => {
    // Start from a graduated card (after learning steps)
    let card = makeCard({ state: 2, stability: DEFAULT_FSRS_PARAMS.w[2], difficulty: 5, scheduled_date: new Date(Date.now() - 2 * 86400000).toISOString() });
    let prevInterval = 2;
    let prevStability = card.stability;
    for (let i = 0; i < 8; i++) {
      const r = fsrsSchedule(card, 3, params);
      expect(r.stability).toBeGreaterThan(prevStability);
      expect(r.interval_days).toBeGreaterThanOrEqual(prevInterval);
      prevInterval = r.interval_days;
      prevStability = r.stability;
      card = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: new Date(Date.now() - r.interval_days * 86400000).toISOString(), learning_step: 0 };
    }
  });

  it('43. Overdue (60d elapsed, 5d stability) still works', () => {
    const r = fsrsSchedule(reviewCard(5, 5, 60), 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
    expect(r.stability).toBeGreaterThan(0);
  });

  it('44. Forget stability always >= 0.1', () => {
    const r = fsrsSchedule(reviewCard(0.5, 9, 1), 1, params);
    expect(r.stability).toBeGreaterThanOrEqual(0.1);
  });

  it('45. Moderate overdue (20d elapsed, 10d stability)', () => {
    const card = reviewCard(10, 5, 20);
    const r = fsrsSchedule(card, 3, params);
    expect(r.interval_days).toBeGreaterThan(10);
  });

  it('46. Extreme overdue (365d elapsed, 5d stability)', () => {
    const card = reviewCard(5, 5, 365);
    const r = fsrsSchedule(card, 3, params);
    expect(r.state).toBe(2);
    expect(r.stability).toBeGreaterThan(0);
  });

  it('47. Hard on review → interval_days > 0 (future, NOT session)', () => {
    const card = reviewCard(10, 5, 10);
    const r = fsrsSchedule(card, 2, params);
    expect(r.interval_days).toBeGreaterThan(0);
    expect(r.state).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// BLOCK D: Invariants — 10 tests
// ═══════════════════════════════════════════════════════════════
describe('FSRS – Invariants', () => {
  const ratings: (1|2|3|4)[] = [1, 2, 3, 4];

  it('48-51. New card: all ratings produce valid difficulty [1,10]', () => {
    for (const rating of ratings) {
      const r = fsrsSchedule(makeCard(), rating, params);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      expect(r.difficulty).toBeLessThanOrEqual(10);
    }
  });

  it('52-55. New card: all ratings produce stability >= 0.1', () => {
    for (const rating of ratings) {
      const r = fsrsSchedule(makeCard(), rating, params);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('56. Learning: Again 10x still has stability >= 0.1', () => {
    let card = makeCard({ state: 1, stability: 1, difficulty: 5, learning_step: 0 });
    for (let i = 0; i < 10; i++) {
      const r = fsrsSchedule(card, 1, params);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
      card = { ...card, stability: r.stability, difficulty: r.difficulty, learning_step: r.learning_step };
    }
  });

  it('57. Review: difficulty clamped after repeated Again', () => {
    let card = makeCard({ state: 2, stability: 10, difficulty: 8, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    for (let i = 0; i < 10; i++) {
      const r = fsrsSchedule(card, 1, params);
      expect(r.difficulty).toBeLessThanOrEqual(10);
      card = { stability: r.stability, difficulty: r.difficulty, state: 2, scheduled_date: new Date(Date.now() - 5 * 86400000).toISOString(), learning_step: 0 };
    }
  });

  it('58. Review: difficulty clamped after repeated Easy', () => {
    let card = makeCard({ state: 2, stability: 10, difficulty: 3, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    for (let i = 0; i < 10; i++) {
      const r = fsrsSchedule(card, 4, params);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      card = { stability: r.stability, difficulty: r.difficulty, state: 2, scheduled_date: new Date(Date.now() - r.interval_days * 86400000).toISOString(), learning_step: 0 };
    }
  });

  it('59. interval_days always >= 0', () => {
    for (const rating of ratings) {
      for (const state of [0, 1, 2, 3]) {
        const card = makeCard({ state, stability: 5, difficulty: 5, scheduled_date: new Date(Date.now() - 5 * 86400000).toISOString(), learning_step: 0 });
        const r = fsrsSchedule(card, rating, params);
        expect(r.interval_days).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// BLOCK E: Complete Chains (real user scenarios)
// ═══════════════════════════════════════════════════════════════
describe('FSRS – Complete Chains', () => {
  it('60. New→Good: stays in learning (step 1)', () => {
    const [r] = simulate([3]);
    expect(r.state).toBe(1);
    expect(r.learning_step).toBe(1);
    expect(r.interval_days).toBe(0);
  });

  it('61. New→Good→Good: graduates after completing all steps', () => {
    const [r1, r2] = simulate([3, 3]);
    expect(r1.state).toBe(1);
    expect(r1.learning_step).toBe(1);
    expect(r2.state).toBe(2);
    expect(r2.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('62. New→Again→Good→Good: fail, advance through steps, graduate', () => {
    const [r1, r2, r3] = simulate([1, 3, 3]);
    expect(r1.state).toBe(1);
    expect(r1.learning_step).toBe(0);
    expect(r2.state).toBe(1);
    expect(r2.learning_step).toBe(1);
    expect(r3.state).toBe(2);
  });

  it('63. New→Again→Again→Good→Good: double fail then graduate', () => {
    const [r1, r2, r3, r4] = simulate([1, 1, 3, 3]);
    expect(r1.state).toBe(1);
    expect(r2.state).toBe(1);
    expect(r3.state).toBe(1);
    expect(r3.learning_step).toBe(1);
    expect(r4.state).toBe(2);
  });

  it('64. New→Good→Good→Good: two reviews after graduation', () => {
    const results = simulate([3, 3, 3]);
    expect(results[0].state).toBe(1); // learning step 1
    expect(results[1].state).toBe(2); // graduated
    expect(results[2].state).toBe(2); // review
    expect(results[2].interval_days).toBeGreaterThan(results[1].interval_days);
  });

  it('65. New→Easy→Again: lapse after easy graduation', () => {
    const results = simulate([4, 1]);
    expect(results[0].state).toBe(2);
    expect(results[1].state).toBe(3); // relearning
    expect(results[1].interval_days).toBe(0);
  });

  it('66. New→Good→Good→Again→Good: lapse after grad and re-graduate', () => {
    const results = simulate([3, 3, 1, 3]);
    expect(results[0].state).toBe(1); // learning
    expect(results[1].state).toBe(2); // graduated
    expect(results[2].state).toBe(3); // relearning
    expect(results[3].state).toBe(2); // re-graduated
  });

  it('67. New→Easy: fast track', () => {
    const [r] = simulate([4]);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(4);
  });

  it('68. New→Again→Easy: fail then easy graduation', () => {
    const results = simulate([1, 4]);
    expect(results[0].state).toBe(1);
    expect(results[1].state).toBe(2);
    expect(results[1].interval_days).toBeGreaterThanOrEqual(4);
  });

  it('69. 10-review Good streak after graduation: monotonically increasing intervals', () => {
    // First graduate: Good→Good, then 8 more Good reviews
    const results = simulate([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
    // First two are learning steps, rest are reviews
    const reviewResults = results.filter(r => r.state === 2 && r.interval_days > 0);
    for (let i = 1; i < reviewResults.length; i++) {
      expect(reviewResults[i].interval_days).toBeGreaterThanOrEqual(reviewResults[i-1].interval_days);
    }
  });

  it('70. Full lifecycle: new→learn→review→lapse→relearn→review', () => {
    const results = simulate([1, 3, 3, 3, 1, 3, 3]);
    expect(results[0].state).toBe(1);   // learning
    expect(results[1].state).toBe(1);   // still learning (step 1)
    expect(results[2].state).toBe(2);   // graduated
    expect(results[3].state).toBe(2);   // review
    expect(results[4].state).toBe(3);   // relearning
    expect(results[5].state).toBe(2);   // re-graduated
    expect(results[6].state).toBe(2);   // review again
  });

  it('71. Mixed: Again×3 → Good → Good (graduate)', () => {
    const results = simulate([1, 1, 1, 3, 3]);
    expect(results[0].state).toBe(1);
    expect(results[1].state).toBe(1);
    expect(results[2].state).toBe(1);
    expect(results[3].state).toBe(1); // advance to step 1
    expect(results[4].state).toBe(2); // graduate
  });

  it('72. Again→Hard→Hard→Good→Good: graduate', () => {
    const results = simulate([1, 2, 2, 3, 3]);
    expect(results[4].state).toBe(2);
  });

  it('73. 20-step mixed chain stays valid', () => {
    const ratings: (1|2|3|4)[] = [1, 2, 3, 3, 3, 1, 3, 3, 4, 3, 1, 1, 3, 3, 3, 4, 3, 3, 3, 3];
    const results = simulate(ratings);
    for (const r of results) {
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      expect(r.difficulty).toBeLessThanOrEqual(10);
    }
  });

  it('74. Alternate Again/Good stays bounded', () => {
    const ratings: (1|2|3|4)[] = [1, 3, 1, 3, 1, 3, 1, 3];
    const results = simulate(ratings);
    for (const r of results) {
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      expect(r.difficulty).toBeLessThanOrEqual(10);
    }
  });

  it('75. 5 Easy reviews → very large interval', () => {
    const results = simulate([4, 4, 4, 4, 4]);
    const lastReview = results.filter(r => r.state === 2).pop();
    expect(lastReview!.interval_days).toBeGreaterThan(100);
  });

  it('76. Again×4→Easy (stubborn card)', () => {
    const results = simulate([1, 1, 1, 1, 4]);
    expect(results[4].state).toBe(2);
    expect(results[4].interval_days).toBeGreaterThanOrEqual(4);
  });

  it('77. Easy→Again→Easy→Again (volatile card)', () => {
    const results = simulate([4, 1, 4, 1]);
    for (const r of results) {
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// BLOCK F: Custom params + edge cases
// ═══════════════════════════════════════════════════════════════
describe('FSRS – Custom Params & Edge Cases', () => {
  it('78. maxInterval 1 → all reviews capped at 1d', () => {
    const p = { ...params, maximumInterval: 1 };
    const results = simulate([4, 3, 3], p);
    for (const r of results) {
      if (r.state === 2) expect(r.interval_days).toBeLessThanOrEqual(1);
    }
  });

  it('79. Retention 0.99 → very short intervals', () => {
    const p = { ...params, requestedRetention: 0.99 };
    const r = fsrsSchedule(makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() }), 3, p);
    const rNormal = fsrsSchedule(makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() }), 3, params);
    expect(r.interval_days).toBeLessThan(rNormal.interval_days);
  });

  it('80. Steps [1, 5, 15] – Again uses first', () => {
    const p = { ...params, learningSteps: [1, 5, 15] };
    expect(minutesFromNow(fsrsSchedule(makeCard(), 1, p))).toBeCloseTo(1, 0);
  });

  it('81. Very high difficulty card (9.9) + Again', () => {
    const card = makeCard({ state: 2, stability: 5, difficulty: 9.9, scheduled_date: new Date(Date.now() - 5 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 1, params);
    expect(r.difficulty).toBeLessThanOrEqual(10);
    expect(r.stability).toBeGreaterThanOrEqual(0.1);
  });

  it('82. Very high stability (1000) + Good', () => {
    const card = makeCard({ state: 2, stability: 1000, difficulty: 5, scheduled_date: new Date(Date.now() - 1000 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 3, params);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
    expect(r.interval_days).toBeLessThanOrEqual(params.maximumInterval);
  });

  it('83. Zero elapsed (same-day review) + Good', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date().toISOString() });
    const r = fsrsSchedule(card, 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('84. Zero elapsed + Again → relearning', () => {
    const card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date().toISOString() });
    const r = fsrsSchedule(card, 1, params);
    expect(r.state).toBe(3);
    expect(r.interval_days).toBe(0);
  });

  it('85. Relearning Hard uses avg of relearning steps', () => {
    const p = { ...params, relearningSteps: [5, 25] };
    const card = makeCard({ state: 3, stability: 5, difficulty: 5, learning_step: 0 });
    const r = fsrsSchedule(card, 2, p);
    // avg(5, 25) = 15
    expect(minutesFromNow(r)).toBeCloseTo(15, 0);
  });

  it('86. Learning Hard uses avg of learning steps', () => {
    const p = { ...params, learningSteps: [1, 10] };
    const card = makeCard({ state: 1, stability: 2, difficulty: 5, learning_step: 0 });
    const r = fsrsSchedule(card, 2, p);
    // avg(1, 10) = 5.5
    expect(minutesFromNow(r)).toBeCloseTo(5.5, 0);
  });

  it('87. Stress: 15-step all-Again on new card', () => {
    let card = makeCard();
    for (let i = 0; i < 15; i++) {
      const r = fsrsSchedule(card, 1, params);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
      expect(r.difficulty).toBeLessThanOrEqual(10);
      card = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: r.scheduled_date, learning_step: r.learning_step };
    }
  });

  it('88. Stress: alternate Hard/Easy 10 times on review', () => {
    let card = makeCard({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    for (let i = 0; i < 10; i++) {
      const rating = (i % 2 === 0 ? 2 : 4) as 1|2|3|4;
      const r = fsrsSchedule(card, rating, params);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      expect(r.difficulty).toBeLessThanOrEqual(10);
      if (r.state === 2) {
        card = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: new Date(Date.now() - r.interval_days * 86400000).toISOString(), learning_step: 0 };
      } else {
        card = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: r.scheduled_date, learning_step: r.learning_step };
      }
    }
  });

  it('89. maxInterval 365 with huge stability', () => {
    const p = { ...params, maximumInterval: 365 };
    const card = makeCard({ state: 2, stability: 500, difficulty: 2, scheduled_date: new Date(Date.now() - 500 * 86400000).toISOString() });
    const r = fsrsSchedule(card, 4, p);
    expect(r.interval_days).toBeLessThanOrEqual(365);
  });
});

// ═══════════════════════════════════════════════════════════════
// BLOCK G: Parametric matrix
// ═══════════════════════════════════════════════════════════════
describe('FSRS – Parametric Matrix', () => {
  const configs: { name: string; p: FSRSParams }[] = [
    { name: 'default', p: params },
    { name: 'strict (0.95)', p: { ...params, requestedRetention: 0.95 } },
    { name: 'relaxed (0.80)', p: { ...params, requestedRetention: 0.80 } },
    { name: 'steps [5,30]', p: { ...params, learningSteps: [5, 30] } },
    { name: 'maxInterval 60', p: { ...params, maximumInterval: 60 } },
    { name: 'relearn [5,20]', p: { ...params, relearningSteps: [5, 20] } },
  ];

  for (const { name, p } of configs) {
    it(`${name}: new card all ratings produce valid output`, () => {
      for (const rating of [1, 2, 3, 4] as (1|2|3|4)[]) {
        const r = fsrsSchedule(makeCard(), rating, p);
        expect(r.stability).toBeGreaterThanOrEqual(0.1);
        expect(r.difficulty).toBeGreaterThanOrEqual(1);
        expect(r.difficulty).toBeLessThanOrEqual(10);
        expect(r.interval_days).toBeGreaterThanOrEqual(0);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// BLOCK H: Anki-compatible learning step verification
// ═══════════════════════════════════════════════════════════════
describe('FSRS – Anki Learning Step Compatibility', () => {
  it('New card with [1m, 10m]: Again=1min, Hard≈5.5min, Good=10min, Easy=days', () => {
    const p = { ...params, learningSteps: [1, 10] };
    const again = fsrsSchedule(makeCard(), 1, p);
    const hard = fsrsSchedule(makeCard(), 2, p);
    const good = fsrsSchedule(makeCard(), 3, p);
    const easy = fsrsSchedule(makeCard(), 4, p);

    expect(again.state).toBe(1);
    expect(minutesFromNow(again)).toBeCloseTo(1, 0);
    
    expect(hard.state).toBe(1);
    expect(minutesFromNow(hard)).toBeCloseTo(5.5, 0);
    
    expect(good.state).toBe(1);
    expect(good.learning_step).toBe(1);
    expect(minutesFromNow(good)).toBeCloseTo(10, 0);
    
    expect(easy.state).toBe(2);
    expect(easy.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('New card with [1m, 15m]: Again=1min, Hard≈8min, Good=15min, Easy=days', () => {
    const p = { ...params, learningSteps: [1, 15] };
    const hard = fsrsSchedule(makeCard(), 2, p);
    const good = fsrsSchedule(makeCard(), 3, p);

    expect(minutesFromNow(hard)).toBeCloseTo(8, 0);
    expect(good.state).toBe(1);
    expect(minutesFromNow(good)).toBeCloseTo(15, 0);
  });

  it('Learning step 1 + Good → graduates to review', () => {
    const p = { ...params, learningSteps: [1, 10] };
    const card = makeCard({ state: 1, stability: 2.3, difficulty: 5, learning_step: 1 });
    const r = fsrsSchedule(card, 3, p);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('Learning step 1 + Again → back to step 0', () => {
    const p = { ...params, learningSteps: [1, 10] };
    const card = makeCard({ state: 1, stability: 2.3, difficulty: 5, learning_step: 1 });
    const r = fsrsSchedule(card, 1, p);
    expect(r.state).toBe(1);
    expect(r.learning_step).toBe(0);
    expect(minutesFromNow(r)).toBeCloseTo(1, 0);
  });

  it('learning_step is propagated through output', () => {
    const r = fsrsSchedule(makeCard(), 3, params);
    expect(r).toHaveProperty('learning_step');
    expect(typeof r.learning_step).toBe('number');
  });
});
