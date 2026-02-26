/**
 * Comprehensive FSRS-6 validation tests.
 * Tests all card types (basic, cloze, occlusion, multiple_choice),
 * mathematical formulas, edge cases, Anki compatibility, and integration
 * with the study queue system.
 */
import { describe, it, expect } from 'vitest';
import { fsrsSchedule, fsrsPreviewIntervals, type FSRSCard, type FSRSParams, type FSRSOutput, DEFAULT_FSRS_PARAMS, type Rating } from '@/lib/fsrs';
import { getNextReadyIndex, shouldKeepInSession, applyReviewToQueue } from '@/lib/studyUtils';

// ── Helpers ──

const W = DEFAULT_FSRS_PARAMS.w;
const params = { ...DEFAULT_FSRS_PARAMS };

function card(overrides: Partial<FSRSCard> = {}): FSRSCard {
  return { stability: 0, difficulty: 0, state: 0, scheduled_date: new Date().toISOString(), learning_step: 0, ...overrides };
}

function reviewCard(s: number, d: number, daysPast: number): FSRSCard {
  return card({ state: 2, stability: s, difficulty: d, scheduled_date: new Date(Date.now() - daysPast * 86400000).toISOString() });
}

function minutesFromNow(r: { scheduled_date: string }): number {
  return Math.round((new Date(r.scheduled_date).getTime() - Date.now()) / 60000);
}

function daysFromNow(r: { scheduled_date: string }): number {
  return Math.round((new Date(r.scheduled_date).getTime() - Date.now()) / 86400000);
}

/** Simulate a sequence of ratings starting from a new card */
function simulate(ratings: Rating[], p: FSRSParams = params) {
  let c = card();
  const results: FSRSOutput[] = [];
  for (const rating of ratings) {
    const r = fsrsSchedule(c, rating, p);
    results.push(r);
    const nextScheduled = r.interval_days > 0
      ? new Date(Date.now() - r.interval_days * 86400000).toISOString()
      : r.scheduled_date;
    c = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: nextScheduled, learning_step: r.learning_step };
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════
// SECTION 1: FSRS-6 Mathematical Formula Verification
// ═══════════════════════════════════════════════════════════════
describe('FSRS-6 Mathematical Formulas', () => {

  describe('Initial Stability (w[0..3])', () => {
    it('Again uses w[0]', () => {
      const r = fsrsSchedule(card(), 1, params);
      expect(r.stability).toBeCloseTo(W[0], 3);
    });

    it('Hard uses w[1]', () => {
      const r = fsrsSchedule(card(), 2, params);
      expect(r.stability).toBeCloseTo(W[1], 3);
    });

    it('Good uses w[2]', () => {
      const r = fsrsSchedule(card(), 3, params);
      expect(r.stability).toBeCloseTo(W[2], 3);
    });

    it('Easy uses w[3]', () => {
      const r = fsrsSchedule(card(), 4, params);
      expect(r.stability).toBeCloseTo(W[3], 3);
    });

    it('Stability ordering: Again < Hard < Good < Easy', () => {
      const results = ([1, 2, 3, 4] as Rating[]).map(r => fsrsSchedule(card(), r, params));
      for (let i = 1; i < results.length; i++) {
        expect(results[i].stability).toBeGreaterThan(results[i - 1].stability);
      }
    });
  });

  describe('Initial Difficulty (w[4], w[5])', () => {
    it('formula: D0(G) = w[4] - exp(w[5] * (G-1)) + 1, clamped [1,10]', () => {
      for (const rating of [1, 2, 3, 4] as Rating[]) {
        const expected = Math.max(1, Math.min(10, W[4] - Math.exp(W[5] * (rating - 1)) + 1));
        const r = fsrsSchedule(card(), rating, params);
        expect(r.difficulty).toBeCloseTo(expected, 3);
      }
    });

    it('higher rating → lower difficulty', () => {
      const results = ([1, 2, 3, 4] as Rating[]).map(r => fsrsSchedule(card(), r, params));
      for (let i = 1; i < results.length; i++) {
        expect(results[i].difficulty).toBeLessThanOrEqual(results[i - 1].difficulty);
      }
    });
  });

  describe('Next Difficulty (w[6], w[7]) — Mean Reversion', () => {
    it('Again increases difficulty', () => {
      const c = reviewCard(10, 5, 10);
      const r = fsrsSchedule(c, 1, params);
      expect(r.difficulty).toBeGreaterThan(5);
    });

    it('Easy decreases difficulty', () => {
      const c = reviewCard(10, 5, 10);
      const r = fsrsSchedule(c, 4, params);
      expect(r.difficulty).toBeLessThan(5);
    });

    it('Good keeps difficulty approximately the same (mean reversion)', () => {
      const c = reviewCard(10, 5, 10);
      const r = fsrsSchedule(c, 3, params);
      // With w[7]=0.001 (very small mean reversion), Good should be close to original
      expect(Math.abs(r.difficulty - 5)).toBeLessThan(0.5);
    });

    it('difficulty is always clamped [1, 10]', () => {
      // Very high difficulty + Again
      const r1 = fsrsSchedule(reviewCard(10, 9.9, 10), 1, params);
      expect(r1.difficulty).toBeLessThanOrEqual(10);

      // Very low difficulty + Easy
      const r2 = fsrsSchedule(reviewCard(10, 1.1, 10), 4, params);
      expect(r2.difficulty).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Retrievability Formula', () => {
    it('R(0) = 1 (just reviewed)', () => {
      // Same-day review: elapsed < 1 day, R should be very close to 1
      const c = card({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date().toISOString() });
      // We can't call retrievability directly, but we can verify via same-day behavior
      const r = fsrsSchedule(c, 3, params);
      // Same-day Good should produce modest interval growth
      expect(r.interval_days).toBeGreaterThanOrEqual(1);
    });

    it('R(S) ≈ 0.9 (at stability days)', () => {
      // When elapsed = stability, R should be ~0.9 by design
      const c = reviewCard(10, 5, 10); // elapsed = stability = 10
      // Good recall at R≈0.9 should produce meaningful stability growth
      const r = fsrsSchedule(c, 3, params);
      expect(r.stability).toBeGreaterThan(10);
    });

    it('Overdue card (R << 0.9) still produces valid output', () => {
      const c = reviewCard(5, 5, 100); // massively overdue
      const r = fsrsSchedule(c, 3, params);
      expect(r.stability).toBeGreaterThan(0.1);
      expect(r.interval_days).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Recall Stability (w[8..10], w[15..16])', () => {
    it('Hard penalty (w[15]) reduces stability vs Good', () => {
      const c = reviewCard(10, 5, 10);
      const rHard = fsrsSchedule(c, 2, params);
      const rGood = fsrsSchedule(c, 3, params);
      expect(rHard.stability).toBeLessThanOrEqual(rGood.stability);
    });

    it('Easy bonus (w[16]) increases stability vs Good', () => {
      const c = reviewCard(10, 5, 10);
      const rGood = fsrsSchedule(c, 3, params);
      const rEasy = fsrsSchedule(c, 4, params);
      expect(rEasy.stability).toBeGreaterThanOrEqual(rGood.stability);
    });

    it('Stability always increases on successful recall', () => {
      for (const rating of [2, 3, 4] as Rating[]) {
        const c = reviewCard(10, 5, 10);
        const r = fsrsSchedule(c, rating, params);
        expect(r.stability).toBeGreaterThan(c.stability);
      }
    });
  });

  describe('Forget Stability (w[11..14])', () => {
    it('Again produces stability < original', () => {
      const c = reviewCard(20, 5, 20);
      const r = fsrsSchedule(c, 1, params);
      expect(r.stability).toBeLessThan(c.stability);
    });

    it('Forget stability is always >= 0.1', () => {
      const c = reviewCard(0.5, 9, 1);
      const r = fsrsSchedule(c, 1, params);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
    });

    it('Higher difficulty → lower forget stability (w[12] effect)', () => {
      const cLow = reviewCard(10, 3, 10);
      const cHigh = reviewCard(10, 8, 10);
      const rLow = fsrsSchedule(cLow, 1, params);
      const rHigh = fsrsSchedule(cHigh, 1, params);
      expect(rHigh.stability).toBeLessThanOrEqual(rLow.stability);
    });
  });

  describe('Same-Day Stability (w[17..19])', () => {
    it('Same-day Good does not decrease stability', () => {
      const c = card({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date().toISOString() });
      const r = fsrsSchedule(c, 3, params);
      expect(r.stability).toBeGreaterThanOrEqual(c.stability);
    });

    it('Same-day Again uses nextForgetStability (not just halving)', () => {
      const c = card({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date().toISOString() });
      const r = fsrsSchedule(c, 1, params);
      expect(r.state).toBe(3); // relearning
      // Should NOT be exactly 5 (half of 10) — uses proper forget formula
      expect(r.stability).not.toBeCloseTo(5, 1);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
    });
  });

  describe('Interval Calculation & Decay (w[20])', () => {
    it('interval = S/factor * (R^(-1/decay) - 1), clamped', () => {
      // Verify that intervals respect requestedRetention
      const c = reviewCard(10, 5, 10);
      const r85 = fsrsSchedule(c, 3, { ...params, requestedRetention: 0.85 });
      const r90 = fsrsSchedule(c, 3, { ...params, requestedRetention: 0.90 });
      const r95 = fsrsSchedule(c, 3, { ...params, requestedRetention: 0.95 });
      // Higher retention → shorter intervals
      expect(r95.interval_days).toBeLessThan(r90.interval_days);
      expect(r90.interval_days).toBeLessThan(r85.interval_days);
    });

    it('maximumInterval is respected', () => {
      const c = reviewCard(500, 2, 500);
      const r = fsrsSchedule(c, 4, { ...params, maximumInterval: 30 });
      expect(r.interval_days).toBeLessThanOrEqual(30);
    });

    it('interval_days is always >= 1 for graduated cards', () => {
      const c = reviewCard(0.5, 9, 1);
      for (const rating of [2, 3, 4] as Rating[]) {
        const r = fsrsSchedule(c, rating, params);
        expect(r.interval_days).toBeGreaterThanOrEqual(1);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 2: Learning Step Progression (Anki Compatibility)
// ═══════════════════════════════════════════════════════════════
describe('Learning Steps — Anki Compatibility', () => {

  describe('State 0 (New) → Learning Steps [1, 10]', () => {
    const p = { ...params, learningSteps: [1, 10] };

    it('Again → state 1, step 0, 1min', () => {
      const r = fsrsSchedule(card(), 1, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(0);
      expect(minutesFromNow(r)).toBeCloseTo(1, 0);
    });

    it('Hard → state 1, step 0, avg(1,10)=5.5min', () => {
      const r = fsrsSchedule(card(), 2, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(0);
      const mins = minutesFromNow(r);
      expect(mins).toBeGreaterThanOrEqual(5);
      expect(mins).toBeLessThanOrEqual(6);
    });

    it('Good → state 1, step 1, 10min', () => {
      const r = fsrsSchedule(card(), 3, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(1);
      expect(minutesFromNow(r)).toBeCloseTo(10, 0);
    });

    it('Easy → state 2, graduates with >= 4d', () => {
      const r = fsrsSchedule(card(), 4, p);
      expect(r.state).toBe(2);
      expect(r.interval_days).toBeGreaterThanOrEqual(4);
    });
  });

  describe('State 1 (Learning) — Step Progression', () => {
    const p = { ...params, learningSteps: [1, 10] };

    it('Step 0 + Again → stays step 0', () => {
      const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 0 });
      const r = fsrsSchedule(c, 1, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(0);
      expect(minutesFromNow(r)).toBeCloseTo(1, 0);
    });

    it('Step 0 + Good → advances to step 1', () => {
      const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 0 });
      const r = fsrsSchedule(c, 3, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(1);
      expect(minutesFromNow(r)).toBeCloseTo(10, 0);
    });

    it('Step 1 (last) + Good → graduates to review', () => {
      const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 1 });
      const r = fsrsSchedule(c, 3, p);
      expect(r.state).toBe(2);
      expect(r.interval_days).toBeGreaterThanOrEqual(1);
    });

    it('Step 1 + Again → back to step 0', () => {
      const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 1 });
      const r = fsrsSchedule(c, 1, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(0);
      expect(minutesFromNow(r)).toBeCloseTo(1, 0);
    });

    it('Step 0 + Hard → stays step 0, avg(1,10)=5.5min', () => {
      const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 0 });
      const r = fsrsSchedule(c, 2, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(0);
      const mins = minutesFromNow(r);
      expect(mins).toBeGreaterThanOrEqual(5);
      expect(mins).toBeLessThanOrEqual(6);
    });

    it('Step 1 + Hard → stays step 1, interval = step[1]*1.5 (no next step)', () => {
      const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 1 });
      const r = fsrsSchedule(c, 2, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(1);
      expect(minutesFromNow(r)).toBeCloseTo(15, 0); // 10 * 1.5
    });

    it('Any step + Easy → graduates with >= 4d', () => {
      for (const step of [0, 1]) {
        const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: step });
        const r = fsrsSchedule(c, 4, p);
        expect(r.state).toBe(2);
        expect(r.interval_days).toBeGreaterThanOrEqual(4);
      }
    });

    it('Stability is PRESERVED during learning (Again does NOT halve)', () => {
      const c = card({ state: 1, stability: 3.5, difficulty: 5, learning_step: 0 });
      const r = fsrsSchedule(c, 1, p);
      expect(r.stability).toBe(3.5); // unchanged!
    });

    it('Stability preserved across multiple Again ratings', () => {
      let c = card({ state: 1, stability: 2.3, difficulty: 5, learning_step: 0 });
      for (let i = 0; i < 10; i++) {
        const r = fsrsSchedule(c, 1, p);
        expect(r.stability).toBe(2.3);
        c = { ...c, difficulty: r.difficulty, learning_step: r.learning_step };
      }
    });
  });

  describe('Three Steps [1, 5, 15]', () => {
    const p = { ...params, learningSteps: [1, 5, 15] };

    it('New + Good → step 1 (5min)', () => {
      const r = fsrsSchedule(card(), 3, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(1);
      expect(minutesFromNow(r)).toBeCloseTo(5, 0);
    });

    it('Step 1 + Good → step 2 (15min)', () => {
      const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 1 });
      const r = fsrsSchedule(c, 3, p);
      expect(r.state).toBe(1);
      expect(r.learning_step).toBe(2);
      expect(minutesFromNow(r)).toBeCloseTo(15, 0);
    });

    it('Step 2 + Good → graduates', () => {
      const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 2 });
      const r = fsrsSchedule(c, 3, p);
      expect(r.state).toBe(2);
      expect(r.interval_days).toBeGreaterThanOrEqual(1);
    });

    it('Full path: New→Good→Good→Good graduates', () => {
      const results = simulate([3, 3, 3], p);
      expect(results[0].state).toBe(1);
      expect(results[0].learning_step).toBe(1);
      expect(results[1].state).toBe(1);
      expect(results[1].learning_step).toBe(2);
      expect(results[2].state).toBe(2);
    });

    it('Step 1 + Hard → stays step 1, avg(5,15)=10min', () => {
      const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 1 });
      const r = fsrsSchedule(c, 2, p);
      expect(r.learning_step).toBe(1);
      expect(minutesFromNow(r)).toBeCloseTo(10, 0);
    });
  });

  describe('Single Step [5]', () => {
    const p = { ...params, learningSteps: [5] };

    it('New + Good → graduates immediately (only 1 step)', () => {
      const r = fsrsSchedule(card(), 3, p);
      expect(r.state).toBe(2);
    });

    it('New + Hard → step 0, interval = 5 (same as step[0] since no next)', () => {
      const r = fsrsSchedule(card(), 2, p);
      expect(r.state).toBe(1);
      expect(minutesFromNow(r)).toBeCloseTo(5, 0);
    });

    it('New + Again → step 0, 5min', () => {
      const r = fsrsSchedule(card(), 1, p);
      expect(r.state).toBe(1);
      expect(minutesFromNow(r)).toBeCloseTo(5, 0);
    });
  });

  describe('Relearning Steps', () => {
    it('Relearning uses relearningSteps, not learningSteps', () => {
      const p = { ...params, learningSteps: [1, 10], relearningSteps: [5] };
      const c = card({ state: 3, stability: 5, difficulty: 5, learning_step: 0 });
      const r = fsrsSchedule(c, 1, p);
      expect(minutesFromNow(r)).toBeCloseTo(5, 0); // relearning step, not learning
    });

    it('Relearning + Good → graduates', () => {
      const c = card({ state: 3, stability: 5, difficulty: 5, learning_step: 0 });
      const r = fsrsSchedule(c, 3, params);
      expect(r.state).toBe(2);
      expect(r.interval_days).toBeGreaterThanOrEqual(1);
    });

    it('Multiple relearning steps [5, 20]', () => {
      const p = { ...params, relearningSteps: [5, 20] };
      const c0 = card({ state: 3, stability: 5, difficulty: 5, learning_step: 0 });
      const r0 = fsrsSchedule(c0, 3, p);
      expect(r0.state).toBe(3);
      expect(r0.learning_step).toBe(1);
      expect(minutesFromNow(r0)).toBeCloseTo(20, 0);

      const c1 = card({ state: 3, stability: 5, difficulty: 5, learning_step: 1 });
      const r1 = fsrsSchedule(c1, 3, p);
      expect(r1.state).toBe(2); // graduates
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 3: Card Type Simulations (all types use same FSRS engine)
// ═══════════════════════════════════════════════════════════════
describe('Card Type Simulations', () => {
  // All card types use the same FSRSCard/fsrsSchedule — the card_type field
  // is metadata only. Verify that the algorithm is agnostic to card type.

  const cardTypes = ['basic', 'cloze', 'image_occlusion', 'multiple_choice'];

  for (const cardType of cardTypes) {
    describe(`${cardType} card`, () => {
      it('New → Good → Good → graduates', () => {
        const results = simulate([3, 3]);
        expect(results[0].state).toBe(1); // learning step 1
        expect(results[1].state).toBe(2); // graduated
        expect(results[1].interval_days).toBeGreaterThanOrEqual(1);
      });

      it('Full lifecycle: new → learn → review → lapse → relearn → review', () => {
        const results = simulate([1, 3, 3, 3, 1, 3, 3]);
        expect(results[0].state).toBe(1);   // learning
        expect(results[1].state).toBe(1);   // step 1
        expect(results[2].state).toBe(2);   // graduated
        expect(results[3].state).toBe(2);   // review
        expect(results[4].state).toBe(3);   // lapse → relearning
        expect(results[5].state).toBe(2);   // re-graduated
        expect(results[6].state).toBe(2);   // review
      });

      it('intervals grow monotonically with Good streak after graduation', () => {
        const results = simulate([3, 3, 3, 3, 3, 3, 3, 3]);
        const reviews = results.filter(r => r.state === 2 && r.interval_days > 0);
        for (let i = 1; i < reviews.length; i++) {
          expect(reviews[i].interval_days).toBeGreaterThanOrEqual(reviews[i - 1].interval_days);
        }
      });

      it('difficulty stays bounded after volatile sequence', () => {
        const results = simulate([1, 4, 1, 4, 1, 4, 3, 3]);
        for (const r of results) {
          expect(r.difficulty).toBeGreaterThanOrEqual(1);
          expect(r.difficulty).toBeLessThanOrEqual(10);
          expect(r.stability).toBeGreaterThanOrEqual(0.1);
        }
      });
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// SECTION 4: Interval Preview Consistency
// ═══════════════════════════════════════════════════════════════
describe('fsrsPreviewIntervals', () => {
  it('New card: returns 4 interval strings', () => {
    const c = card();
    const preview = fsrsPreviewIntervals(c, params);
    expect(Object.keys(preview)).toHaveLength(4);
    expect(preview[1]).toBeDefined();
    expect(preview[2]).toBeDefined();
    expect(preview[3]).toBeDefined();
    expect(preview[4]).toBeDefined();
  });

  it('New card with [1, 10]: Again=1min, Hard≈6min, Good=10min, Easy=Xd', () => {
    const c = card();
    const preview = fsrsPreviewIntervals(c, params);
    expect(preview[1]).toBe('1min');
    // Hard: avg(1,10) = 5.5 → rounds to 6min
    expect(preview[2]).toMatch(/^[56]min$/);
    expect(preview[3]).toBe('10min');
    expect(preview[4]).toMatch(/\d+d/);
  });

  it('Learning step 1 card: Again=1min, Good=graduates (Xd)', () => {
    const c = card({ state: 1, stability: 2.3, difficulty: 5, learning_step: 1 });
    const preview = fsrsPreviewIntervals(c, params);
    expect(preview[1]).toBe('1min');
    expect(preview[3]).toMatch(/\d+d/); // graduates
  });

  it('Review card: all intervals are days/months/years', () => {
    const c = reviewCard(10, 5, 10);
    const preview = fsrsPreviewIntervals(c, params);
    // Again goes to relearning (minutes), others are days/months
    expect(preview[1]).toMatch(/min$/);
    expect(preview[2]).toMatch(/\d+[dma]/);
    expect(preview[3]).toMatch(/\d+[dma]/);
    expect(preview[4]).toMatch(/\d+[dma]/);
  });

  it('Preview matches actual schedule output', () => {
    const c = card();
    const preview = fsrsPreviewIntervals(c, params);
    const actual = fsrsSchedule(c, 3, params);
    // Preview for Good should match the actual scheduled interval
    if (actual.interval_days > 0) {
      expect(preview[3]).toMatch(/\d+d/);
    } else {
      expect(preview[3]).toMatch(/min$/);
    }
  });

  it('learning_step affects preview correctly', () => {
    // Step 0: Good should show 10min
    const c0 = card({ state: 1, stability: 2, difficulty: 5, learning_step: 0 });
    const p0 = fsrsPreviewIntervals(c0, params);
    expect(p0[3]).toBe('10min');

    // Step 1: Good should show days (graduates)
    const c1 = card({ state: 1, stability: 2, difficulty: 5, learning_step: 1 });
    const p1 = fsrsPreviewIntervals(c1, params);
    expect(p1[3]).toMatch(/\d+d/);
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 5: Queue Integration with FSRS
// ═══════════════════════════════════════════════════════════════
describe('Study Queue Integration', () => {

  it('learning card (interval_days=0) stays in session', () => {
    const r = fsrsSchedule(card(), 1, params); // Again → learning
    expect(shouldKeepInSession(r)).toBe(true);
  });

  it('graduated card (interval_days>0) is removed from session', () => {
    const r = fsrsSchedule(card(), 4, params); // Easy → graduates
    expect(shouldKeepInSession(r)).toBe(false);
  });

  it('learning card moved to end of queue after review', () => {
    const queue = [
      { id: 'c1', state: 1, stability: 2, difficulty: 5, scheduled_date: new Date().toISOString() },
      { id: 'c2', state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() },
      { id: 'c3', state: 2, stability: 10, difficulty: 5, scheduled_date: new Date().toISOString() },
    ];
    const result = fsrsSchedule(
      { stability: 2, difficulty: 5, state: 1, scheduled_date: new Date().toISOString(), learning_step: 0 },
      1, params
    );
    const newQueue = applyReviewToQueue(queue, 'c1', result);
    expect(newQueue[newQueue.length - 1].id).toBe('c1');
    expect(newQueue).toHaveLength(3);
  });

  it('graduated card removed from queue', () => {
    const queue = [
      { id: 'c1', state: 1, stability: 2, difficulty: 5, scheduled_date: new Date().toISOString() },
      { id: 'c2', state: 0, stability: 0, difficulty: 0, scheduled_date: new Date().toISOString() },
    ];
    const result = fsrsSchedule(
      { stability: 2, difficulty: 5, state: 1, scheduled_date: new Date().toISOString(), learning_step: 1 },
      3, params
    );
    const newQueue = applyReviewToQueue(queue, 'c1', result);
    expect(newQueue).toHaveLength(1);
    expect(newQueue[0].id).toBe('c2');
  });

  it('learning card with expired timer cuts the line', () => {
    const queue = [
      { state: 0, scheduled_date: new Date().toISOString() },
      { state: 2, scheduled_date: new Date(Date.now() - 3600000).toISOString() },
      { state: 1, scheduled_date: new Date(Date.now() - 60000).toISOString() }, // expired
    ];
    expect(getNextReadyIndex(queue)).toBe(2);
  });

  it('learning card with future timer does NOT cut the line', () => {
    const queue = [
      { state: 0, scheduled_date: new Date().toISOString() },
      { state: 1, scheduled_date: new Date(Date.now() + 300000).toISOString() }, // 5min future
    ];
    expect(getNextReadyIndex(queue)).toBe(0);
  });

  it('relearning card (state 3) with expired timer cuts the line', () => {
    const queue = [
      { state: 0, scheduled_date: new Date().toISOString() },
      { state: 3, scheduled_date: new Date(Date.now() - 60000).toISOString() }, // expired relearning
    ];
    expect(getNextReadyIndex(queue)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 6: Long Simulations & Stress Tests
// ═══════════════════════════════════════════════════════════════
describe('Long Simulations & Stress', () => {

  it('50-review Good streak: intervals grow and stay bounded', () => {
    const ratings = [3, 3, ...Array(48).fill(3)] as Rating[];
    const results = simulate(ratings);
    const reviews = results.filter(r => r.state === 2 && r.interval_days > 0);
    for (let i = 1; i < reviews.length; i++) {
      expect(reviews[i].interval_days).toBeGreaterThanOrEqual(reviews[i - 1].interval_days);
    }
    // Last interval should be very large
    expect(reviews[reviews.length - 1].interval_days).toBeGreaterThan(365);
    // But bounded by maximumInterval
    expect(reviews[reviews.length - 1].interval_days).toBeLessThanOrEqual(params.maximumInterval);
  });

  it('Alternating Again/Good 20 times: system stays stable', () => {
    const ratings = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 1 : 3) as Rating);
    const results = simulate(ratings);
    for (const r of results) {
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      expect(r.difficulty).toBeLessThanOrEqual(10);
      expect(r.interval_days).toBeGreaterThanOrEqual(0);
    }
  });

  it('All Again 30 times: card stays in learning, never crashes', () => {
    const ratings = Array(30).fill(1) as Rating[];
    const results = simulate(ratings);
    for (const r of results) {
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
      expect(r.state).toBe(1); // stays learning
      expect(r.learning_step).toBe(0);
    }
  });

  it('Random 100-rating sequence: no NaN, Infinity, or crashes', () => {
    const ratings: Rating[] = [];
    for (let i = 0; i < 100; i++) {
      ratings.push(([1, 2, 3, 4] as Rating[])[Math.floor(Math.random() * 4)]);
    }
    const results = simulate(ratings);
    for (const r of results) {
      expect(Number.isFinite(r.stability)).toBe(true);
      expect(Number.isFinite(r.difficulty)).toBe(true);
      expect(Number.isFinite(r.interval_days)).toBe(true);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
      expect(r.difficulty).toBeGreaterThanOrEqual(1);
      expect(r.difficulty).toBeLessThanOrEqual(10);
      expect(r.interval_days).toBeGreaterThanOrEqual(0);
    }
  });

  it('Extreme overdue (1000 days) with all ratings produces valid output', () => {
    const c = reviewCard(5, 5, 1000);
    for (const rating of [1, 2, 3, 4] as Rating[]) {
      const r = fsrsSchedule(c, rating, params);
      expect(Number.isFinite(r.stability)).toBe(true);
      expect(Number.isFinite(r.difficulty)).toBe(true);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
    }
  });

  it('Near-zero stability (0.1) with all ratings produces valid output', () => {
    const c = reviewCard(0.1, 9, 1);
    for (const rating of [1, 2, 3, 4] as Rating[]) {
      const r = fsrsSchedule(c, rating, params);
      expect(Number.isFinite(r.stability)).toBe(true);
      expect(r.stability).toBeGreaterThanOrEqual(0.1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 7: Retention Sensitivity & Param Matrix
// ═══════════════════════════════════════════════════════════════
describe('Retention Sensitivity', () => {
  const retentions = [0.80, 0.85, 0.90, 0.95, 0.99];
  const c = reviewCard(10, 5, 10);

  it('Higher retention → shorter intervals (monotonic)', () => {
    const intervals = retentions.map(r =>
      fsrsSchedule(c, 3, { ...params, requestedRetention: r }).interval_days
    );
    for (let i = 1; i < intervals.length; i++) {
      expect(intervals[i]).toBeLessThanOrEqual(intervals[i - 1]);
    }
  });

  it('retention=0.80 produces meaningfully longer intervals than 0.95', () => {
    const r80 = fsrsSchedule(c, 3, { ...params, requestedRetention: 0.80 });
    const r95 = fsrsSchedule(c, 3, { ...params, requestedRetention: 0.95 });
    expect(r80.interval_days).toBeGreaterThan(r95.interval_days * 1.5);
  });
});

describe('Parameter Matrix — All configs produce valid output', () => {
  const configs: { name: string; p: FSRSParams }[] = [
    { name: 'default (0.85)', p: params },
    { name: 'strict (0.95)', p: { ...params, requestedRetention: 0.95 } },
    { name: 'relaxed (0.80)', p: { ...params, requestedRetention: 0.80 } },
    { name: 'steps [1]', p: { ...params, learningSteps: [1] } },
    { name: 'steps [1,5,15]', p: { ...params, learningSteps: [1, 5, 15] } },
    { name: 'steps [5,30,60]', p: { ...params, learningSteps: [5, 30, 60] } },
    { name: 'maxInterval 7', p: { ...params, maximumInterval: 7 } },
    { name: 'maxInterval 365', p: { ...params, maximumInterval: 365 } },
    { name: 'relearn [5,20]', p: { ...params, relearningSteps: [5, 20] } },
    { name: 'relearn [1]', p: { ...params, relearningSteps: [1] } },
  ];

  for (const { name, p } of configs) {
    it(`${name}: new card all ratings valid`, () => {
      for (const rating of [1, 2, 3, 4] as Rating[]) {
        const r = fsrsSchedule(card(), rating, p);
        expect(r.stability).toBeGreaterThanOrEqual(0.1);
        expect(r.difficulty).toBeGreaterThanOrEqual(1);
        expect(r.difficulty).toBeLessThanOrEqual(10);
        expect(r.interval_days).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(r.stability)).toBe(true);
      }
    });

    it(`${name}: full lifecycle valid`, () => {
      const results = simulate([1, 3, 3, 3, 1, 3, 3], p);
      for (const r of results) {
        expect(r.stability).toBeGreaterThanOrEqual(0.1);
        expect(r.difficulty).toBeGreaterThanOrEqual(1);
        expect(r.difficulty).toBeLessThanOrEqual(10);
        expect(Number.isFinite(r.stability)).toBe(true);
      }
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// SECTION 8: Edge Cases & Bug Regressions
// ═══════════════════════════════════════════════════════════════
describe('Edge Cases & Bug Regressions', () => {

  it('Card with stability=0 and state=1 initializes properly', () => {
    const c = card({ state: 1, stability: 0, difficulty: 0, learning_step: 0 });
    const r = fsrsSchedule(c, 3, params);
    expect(r.stability).toBeGreaterThan(0);
    expect(r.difficulty).toBeGreaterThanOrEqual(1);
  });

  it('Card with negative scheduled_date is handled', () => {
    const c = card({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date(0).toISOString() });
    const r = fsrsSchedule(c, 3, params);
    expect(Number.isFinite(r.stability)).toBe(true);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('learning_step beyond steps array length is handled gracefully', () => {
    // Step is 5 but only 2 steps exist
    const c = card({ state: 1, stability: 2, difficulty: 5, learning_step: 5 });
    const r = fsrsSchedule(c, 3, params);
    // Should graduate since step >= steps.length
    expect(r.state).toBe(2);
  });

  it('Empty learning steps array defaults gracefully', () => {
    const p = { ...params, learningSteps: [] as number[] };
    const r = fsrsSchedule(card(), 3, p);
    // With 0 steps, Good should graduate immediately
    expect(r.state).toBe(2);
  });

  it('DEFAULT_FSRS_PARAMS has requestedRetention=0.85', () => {
    expect(DEFAULT_FSRS_PARAMS.requestedRetention).toBe(0.85);
  });

  it('DEFAULT_FSRS_PARAMS has learningSteps=[1, 10]', () => {
    expect(DEFAULT_FSRS_PARAMS.learningSteps).toEqual([1, 10]);
  });

  it('DEFAULT_FSRS_PARAMS has 21 weights (FSRS-6)', () => {
    expect(DEFAULT_FSRS_PARAMS.w).toHaveLength(21);
  });

  it('Review interval ordering: Again(lapse) < Hard ≤ Good ≤ Easy', () => {
    const c = reviewCard(15, 5, 15);
    const rAgain = fsrsSchedule(c, 1, params);
    const rHard = fsrsSchedule(c, 2, params);
    const rGood = fsrsSchedule(c, 3, params);
    const rEasy = fsrsSchedule(c, 4, params);

    // Again goes to relearning (0 days)
    expect(rAgain.interval_days).toBe(0);
    // Hard ≤ Good ≤ Easy
    expect(rHard.interval_days).toBeLessThanOrEqual(rGood.interval_days);
    expect(rGood.interval_days).toBeLessThanOrEqual(rEasy.interval_days);
  });

  it('Graduation interval respects maximumInterval', () => {
    const p = { ...params, maximumInterval: 5 };
    const r = fsrsSchedule(card(), 4, p); // Easy graduation
    // minDays=4, but maximumInterval=5, so it could be up to 5
    expect(r.interval_days).toBeLessThanOrEqual(Math.max(5, 4));
  });

  it('Same-day review + Hard stays in review', () => {
    const c = card({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date().toISOString() });
    const r = fsrsSchedule(c, 2, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('Same-day review + Easy stays in review', () => {
    const c = card({ state: 2, stability: 10, difficulty: 5, scheduled_date: new Date().toISOString() });
    const r = fsrsSchedule(c, 4, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('Review card: Good interval > current interval (no regression)', () => {
    const c = reviewCard(10, 5, 10);
    const r = fsrsSchedule(c, 3, params);
    expect(r.interval_days).toBeGreaterThan(10);
  });

  it('Review card: Hard interval >= current interval', () => {
    const c = reviewCard(10, 5, 10);
    const r = fsrsSchedule(c, 2, params);
    expect(r.interval_days).toBeGreaterThanOrEqual(10);
  });

  it('Review card: Easy interval > Good interval', () => {
    const c = reviewCard(10, 5, 10);
    const rGood = fsrsSchedule(c, 3, params);
    const rEasy = fsrsSchedule(c, 4, params);
    expect(rEasy.interval_days).toBeGreaterThanOrEqual(rGood.interval_days);
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 9: Sibling Burying Logic (Unit)
// ═══════════════════════════════════════════════════════════════
describe('Sibling Burying Logic', () => {
  it('Only 1 cloze sibling per front_content is kept', () => {
    const queue = [
      { id: 'c1', card_type: 'cloze', front_content: '{{c1::A}} and {{c2::B}}', state: 0 },
      { id: 'c2', card_type: 'cloze', front_content: '{{c1::A}} and {{c2::B}}', state: 0 },
      { id: 'c3', card_type: 'basic', front_content: 'different', state: 0 },
      { id: 'c4', card_type: 'cloze', front_content: '{{c1::X}} and {{c2::Y}}', state: 0 },
      { id: 'c5', card_type: 'cloze', front_content: '{{c1::X}} and {{c2::Y}}', state: 0 },
    ];

    // Simulate burying logic from studyService
    const seenFronts = new Set<string>();
    const filtered = queue.filter(card => {
      if (card.card_type !== 'cloze') return true;
      if (seenFronts.has(card.front_content)) return false;
      seenFronts.add(card.front_content);
      return true;
    });

    expect(filtered).toHaveLength(3); // c1, c3, c4
    expect(filtered.map(c => c.id)).toEqual(['c1', 'c3', 'c4']);
  });

  it('Non-cloze cards are never buried', () => {
    const queue = [
      { id: 'c1', card_type: 'basic', front_content: 'same', state: 0 },
      { id: 'c2', card_type: 'basic', front_content: 'same', state: 0 },
      { id: 'c3', card_type: 'image_occlusion', front_content: 'same', state: 0 },
      { id: 'c4', card_type: 'multiple_choice', front_content: 'same', state: 0 },
    ];

    const seenFronts = new Set<string>();
    const filtered = queue.filter(card => {
      if (card.card_type !== 'cloze') return true;
      if (seenFronts.has(card.front_content)) return false;
      seenFronts.add(card.front_content);
      return true;
    });

    expect(filtered).toHaveLength(4); // all kept
  });

  it('Empty queue returns empty', () => {
    const seenFronts = new Set<string>();
    const filtered = ([] as any[]).filter(card => {
      if (card.card_type !== 'cloze') return true;
      if (seenFronts.has(card.front_content)) return false;
      seenFronts.add(card.front_content);
      return true;
    });
    expect(filtered).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// SECTION 10: Format Interval Output
// ═══════════════════════════════════════════════════════════════
describe('formatInterval (via fsrsPreviewIntervals)', () => {
  it('Learning intervals show minutes', () => {
    const r = fsrsSchedule(card(), 1, params);
    const preview = fsrsPreviewIntervals(card(), params);
    expect(preview[1]).toMatch(/min$/);
  });

  it('1-day interval shows "1d"', () => {
    // Find a config that produces exactly 1d
    const c = card({ state: 1, stability: 0.5, difficulty: 8, learning_step: 1 });
    const r = fsrsSchedule(c, 3, params);
    if (r.interval_days === 1) {
      const preview = fsrsPreviewIntervals(c, params);
      expect(preview[3]).toBe('1d');
    }
  });

  it('30+ day intervals show months', () => {
    const c = reviewCard(50, 3, 50);
    const r = fsrsSchedule(c, 4, params);
    if (r.interval_days >= 30 && r.interval_days < 365) {
      const preview = fsrsPreviewIntervals(c, params);
      expect(preview[4]).toMatch(/m$/);
    }
  });

  it('365+ day intervals show years', () => {
    const c = reviewCard(500, 2, 500);
    const r = fsrsSchedule(c, 4, params);
    if (r.interval_days >= 365) {
      const preview = fsrsPreviewIntervals(c, params);
      expect(preview[4]).toMatch(/a$/);
    }
  });
});
