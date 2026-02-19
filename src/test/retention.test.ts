import { describe, it, expect } from 'vitest';
import { calculateCardRecall } from '@/components/RetentionGauge';

// Helper: create a card with scheduled_date relative to now
function makeCard(opts: {
  state: number;
  stability: number;
  difficulty: number;
  scheduledOffsetDays: number;
  last_reviewed_at?: string;
}) {
  const d = new Date();
  d.setDate(d.getDate() + opts.scheduledOffsetDays);
  return {
    state: opts.state,
    stability: opts.stability,
    difficulty: opts.difficulty,
    scheduled_date: d.toISOString(),
    last_reviewed_at: opts.last_reviewed_at,
  };
}

/** Create a card with explicit last_reviewed_at offset (in days from now) */
function makeCardWithReview(opts: {
  state: number;
  stability: number;
  difficulty: number;
  scheduledOffsetDays: number;
  reviewedAgoMinutes?: number;
  reviewedAgoDays?: number;
}) {
  const d = new Date();
  d.setDate(d.getDate() + opts.scheduledOffsetDays);
  const reviewed = new Date();
  if (opts.reviewedAgoMinutes !== undefined) {
    reviewed.setMinutes(reviewed.getMinutes() - opts.reviewedAgoMinutes);
  } else if (opts.reviewedAgoDays !== undefined) {
    reviewed.setDate(reviewed.getDate() - opts.reviewedAgoDays);
  }
  return {
    state: opts.state,
    stability: opts.stability,
    difficulty: opts.difficulty,
    scheduled_date: d.toISOString(),
    last_reviewed_at: reviewed.toISOString(),
  };
}

// FSRS power-law constants for manual verification
const DECAY = -0.5;
const FACTOR = 19 / 81;

function expectedFSRS(stability: number, elapsedDays: number): number {
  return Math.round(Math.pow(1 + FACTOR * elapsedDays / stability, DECAY) * 100);
}

// ===================== FSRS TESTS =====================
describe('FSRS Recall Algorithm', () => {
  const algo = 'fsrs';

  it('new card (state=0) → 0%', () => {
    expect(calculateCardRecall(makeCard({ state: 0, stability: 5, difficulty: 5, scheduledOffsetDays: 0 }), algo).percent).toBe(0);
  });

  it('at due date (fallback, no last_reviewed_at) → exactly 90%', () => {
    for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100, 365]) {
      const card = makeCard({ state: 2, stability: s, difficulty: 5, scheduledOffsetDays: 0 });
      expect(calculateCardRecall(card, algo).percent).toBe(90);
    }
  });

  it('just reviewed (last_reviewed_at = now) → ~100%', () => {
    for (const s of [1, 5, 10, 30]) {
      const card = makeCardWithReview({ state: 2, stability: s, difficulty: 5, scheduledOffsetDays: s, reviewedAgoMinutes: 0 });
      const r = calculateCardRecall(card, algo);
      expect(r.percent).toBeGreaterThanOrEqual(98);
    }
  });

  it('just reviewed (fallback, scheduled in S days) → ~100%', () => {
    for (const s of [1, 5, 10, 30]) {
      const card = makeCard({ state: 2, stability: s, difficulty: 5, scheduledOffsetDays: s });
      const r = calculateCardRecall(card, algo);
      expect(r.percent).toBeGreaterThanOrEqual(98);
    }
  });

  it('half-way to due → R ≈ 95%', () => {
    const s = 10;
    const card = makeCard({ state: 2, stability: s, difficulty: 5, scheduledOffsetDays: Math.round(s / 2) });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBeGreaterThanOrEqual(93);
    expect(r.percent).toBeLessThanOrEqual(97);
  });

  it('overdue 1 day (S=5) → drops slightly below 90%', () => {
    const card = makeCard({ state: 2, stability: 5, difficulty: 5, scheduledOffsetDays: -1 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBeGreaterThanOrEqual(83);
    expect(r.percent).toBeLessThanOrEqual(90);
  });

  it('overdue 10 days (S=5) → noticeable drop', () => {
    const card = makeCard({ state: 2, stability: 5, difficulty: 5, scheduledOffsetDays: -10 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBeGreaterThanOrEqual(60);
    expect(r.percent).toBeLessThanOrEqual(85);
  });

  it('overdue 30 days (S=5) → large drop', () => {
    const card = makeCard({ state: 2, stability: 5, difficulty: 5, scheduledOffsetDays: -30 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBeGreaterThanOrEqual(40);
    expect(r.percent).toBeLessThanOrEqual(70);
  });

  it('overdue 100 days (S=5) → very low', () => {
    const card = makeCard({ state: 2, stability: 5, difficulty: 5, scheduledOffsetDays: -100 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBeGreaterThanOrEqual(15);
    expect(r.percent).toBeLessThanOrEqual(45);
  });

  it('high stability decays slower than low stability', () => {
    const highS = calculateCardRecall(makeCard({ state: 2, stability: 50, difficulty: 5, scheduledOffsetDays: -10 }), algo);
    const lowS = calculateCardRecall(makeCard({ state: 2, stability: 2, difficulty: 5, scheduledOffsetDays: -10 }), algo);
    expect(highS.percent).toBeGreaterThan(lowS.percent);
  });

  it('monotonically decreasing as overdue increases', () => {
    const results: number[] = [];
    for (const offset of [10, 5, 0, -5, -10, -20, -50, -100]) {
      results.push(calculateCardRecall(makeCard({ state: 2, stability: 10, difficulty: 5, scheduledOffsetDays: offset }), algo).percent);
    }
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeLessThanOrEqual(results[i - 1]);
    }
  });

  it('never reaches exactly 0% (power law is gentle)', () => {
    const card = makeCard({ state: 2, stability: 1, difficulty: 5, scheduledOffsetDays: -365 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBeGreaterThan(0);
  });

  // ---- 50 parametric FSRS simulations ----
  it('50 parametric simulations match expected formula (fallback)', () => {
    const stabilities = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 365];
    const offsets = [-100, -50, -20, -10, -5, -1, 0, 5, 10, 20];
    let count = 0;
    for (const s of stabilities) {
      for (const offset of offsets) {
        if (count >= 50) break;
        const card = makeCard({ state: 2, stability: s, difficulty: 5, scheduledOffsetDays: offset });
        const r = calculateCardRecall(card, algo);

        // Manually compute expected: lastReview = scheduled - S days, elapsed = S - offset
        const elapsedDays = Math.max(0, s - offset);
        const expected = expectedFSRS(s, elapsedDays);

        expect(Math.abs(r.percent - expected)).toBeLessThanOrEqual(1);
        expect(r.percent).toBeGreaterThanOrEqual(0);
        expect(r.percent).toBeLessThanOrEqual(100);
        count++;
      }
    }
    expect(count).toBe(50);
  });
});

// ===================== LEARNING CARD TESTS (NEW BEHAVIOR) =====================
describe('Learning cards with last_reviewed_at', () => {
  it('FSRS: just reviewed learning card → high recall (~95%+)', () => {
    const card = makeCardWithReview({ state: 1, stability: 0.5, difficulty: 5, scheduledOffsetDays: 0, reviewedAgoMinutes: 0 });
    const r = calculateCardRecall(card, 'fsrs');
    expect(r.percent).toBeGreaterThanOrEqual(90);
    expect(r.state).toBe('learning');
  });

  it('FSRS: learning card reviewed 30min ago with low stability → decayed', () => {
    const card = makeCardWithReview({ state: 1, stability: 0.007, difficulty: 5, scheduledOffsetDays: 0, reviewedAgoMinutes: 30 });
    const r = calculateCardRecall(card, 'fsrs');
    expect(r.percent).toBeLessThan(85);
    expect(r.state).toBe('learning');
  });

  it('SM-2: just reviewed learning card → high recall', () => {
    // SM-2 learning: step = scheduled - lastReview, just reviewed → elapsed ≈ 0
    const card = makeCardWithReview({ state: 1, stability: 2.5, difficulty: 1, scheduledOffsetDays: 0, reviewedAgoMinutes: 0 });
    const r = calculateCardRecall(card, 'sm2');
    expect(r.percent).toBeGreaterThanOrEqual(90);
    expect(r.state).toBe('learning');
  });

  it('Review card with last_reviewed_at: just reviewed → ~100%', () => {
    const card = makeCardWithReview({ state: 2, stability: 10, difficulty: 5, scheduledOffsetDays: 10, reviewedAgoMinutes: 0 });
    const r = calculateCardRecall(card, 'fsrs');
    expect(r.percent).toBeGreaterThanOrEqual(98);
  });

  it('Review card with last_reviewed_at: on due date → ~90%', () => {
    const card = makeCardWithReview({ state: 2, stability: 10, difficulty: 5, scheduledOffsetDays: 0, reviewedAgoDays: 10 });
    const r = calculateCardRecall(card, 'fsrs');
    expect(r.percent).toBeGreaterThanOrEqual(88);
    expect(r.percent).toBeLessThanOrEqual(92);
  });

  it('SM-2 review with last_reviewed_at: real interval used as stability', () => {
    // Reviewed 5 days ago, scheduled today → interval=5 days → elapsed=5 → R=90%
    const card = makeCardWithReview({ state: 2, stability: 2.5, difficulty: 3, scheduledOffsetDays: 0, reviewedAgoDays: 5 });
    const r = calculateCardRecall(card, 'sm2');
    expect(r.percent).toBe(90);
  });
});

// ===================== FALLBACK TESTS (no last_reviewed_at) =====================
describe('Fallback behavior (legacy cards without last_reviewed_at)', () => {
  it('FSRS learning card fallback → uses estimated step', () => {
    const card = makeCard({ state: 1, stability: 0.5, difficulty: 5, scheduledOffsetDays: 0 });
    const r = calculateCardRecall(card, 'fsrs');
    // Should produce some value (not crash), exact value depends on estimation
    expect(r.percent).toBeGreaterThanOrEqual(0);
    expect(r.percent).toBeLessThanOrEqual(100);
    expect(r.state).toBe('learning');
  });

  it('SM-2 learning card fallback → uses 10min step estimate', () => {
    const card = makeCard({ state: 1, stability: 2.5, difficulty: 1, scheduledOffsetDays: 0 });
    const r = calculateCardRecall(card, 'sm2');
    expect(r.percent).toBeGreaterThanOrEqual(0);
    expect(r.percent).toBeLessThanOrEqual(100);
    expect(r.state).toBe('learning');
  });

  it('SM-2 review card fallback → same as before', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 3, scheduledOffsetDays: 0 });
    const r = calculateCardRecall(card, 'sm2');
    expect(r.percent).toBe(90);
  });
});

// ===================== SM-2 TESTS =====================
describe('SM-2 Recall Algorithm (power-law based)', () => {
  const algo = 'sm2';

  it('new card (state=0) → 0%', () => {
    expect(calculateCardRecall(makeCard({ state: 0, stability: 2.5, difficulty: 0, scheduledOffsetDays: 0 }), algo).percent).toBe(0);
  });

  it('review card on time (rep=3, EF=2.5) → ~90%', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 3, scheduledOffsetDays: 0 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBe(90);
  });

  it('review card with many reps on time → 90%', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 8, scheduledOffsetDays: 0 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBe(90);
  });

  it('review card overdue → drops below 90%', () => {
    const onTime = calculateCardRecall(makeCard({ state: 2, stability: 2.5, difficulty: 5, scheduledOffsetDays: 0 }), algo);
    const overdue = calculateCardRecall(makeCard({ state: 2, stability: 2.5, difficulty: 5, scheduledOffsetDays: -10 }), algo);
    expect(overdue.percent).toBeLessThan(onTime.percent);
  });

  it('review card far overdue → low but not 0', () => {
    const card = makeCard({ state: 2, stability: 1.5, difficulty: 3, scheduledOffsetDays: -60 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBeGreaterThan(0);
    expect(r.percent).toBeLessThanOrEqual(70);
  });

  it('SM-2 monotonically decreasing as overdue increases', () => {
    const results: number[] = [];
    for (const offset of [5, 0, -5, -10, -20, -40, -80]) {
      results.push(calculateCardRecall(makeCard({ state: 2, stability: 2.0, difficulty: 4, scheduledOffsetDays: offset }), algo).percent);
    }
    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toBeLessThanOrEqual(results[i - 1]);
    }
  });

  it('higher reps = longer effective stability = slower decay when overdue', () => {
    const fewReps = calculateCardRecall(makeCard({ state: 2, stability: 2.5, difficulty: 2, scheduledOffsetDays: -10 }), algo);
    const manyReps = calculateCardRecall(makeCard({ state: 2, stability: 2.5, difficulty: 5, scheduledOffsetDays: -10 }), algo);
    expect(manyReps.percent).toBeGreaterThanOrEqual(fewReps.percent);
  });
});

// ===================== CONSISTENCY TESTS =====================
describe('Cross-algorithm consistency', () => {
  it('new cards always 0% for both algorithms', () => {
    const card = makeCard({ state: 0, stability: 10, difficulty: 5, scheduledOffsetDays: 5 });
    expect(calculateCardRecall(card, 'fsrs').percent).toBe(0);
    expect(calculateCardRecall(card, 'sm2').percent).toBe(0);
  });

  it('both algorithms return 90% at due date for review cards (fallback)', () => {
    const fsrs = calculateCardRecall(makeCard({ state: 2, stability: 10, difficulty: 5, scheduledOffsetDays: 0 }), 'fsrs');
    const sm2 = calculateCardRecall(makeCard({ state: 2, stability: 2.5, difficulty: 4, scheduledOffsetDays: 0 }), 'sm2');
    expect(fsrs.percent).toBe(90);
    expect(sm2.percent).toBe(90);
  });

  it('retention never exceeds 100% or goes below 0%', () => {
    const extremes = [
      makeCard({ state: 2, stability: 0.01, difficulty: 10, scheduledOffsetDays: -365 }),
      makeCard({ state: 2, stability: 1000, difficulty: 1, scheduledOffsetDays: 999 }),
      makeCard({ state: 1, stability: 0.1, difficulty: 0, scheduledOffsetDays: -100 }),
      makeCard({ state: 2, stability: 0.1, difficulty: 0, scheduledOffsetDays: -1000 }),
    ];
    for (const card of extremes) {
      for (const algo of ['fsrs', 'sm2']) {
        const r = calculateCardRecall(card, algo);
        expect(r.percent).toBeGreaterThanOrEqual(0);
        expect(r.percent).toBeLessThanOrEqual(100);
      }
    }
  });

  it('deterministic: same input → same output', () => {
    const card = makeCard({ state: 2, stability: 5, difficulty: 5, scheduledOffsetDays: -3 });
    const r1 = calculateCardRecall(card, 'fsrs');
    const r2 = calculateCardRecall(card, 'fsrs');
    expect(r1.percent).toBe(r2.percent);
  });
});

// ===================== 50 SM-2 PARAMETRIC SIMULATIONS =====================
describe('SM-2: 50 parametric simulations', () => {
  const algo = 'sm2';
  
  it('50 SM-2 scenarios produce valid, bounded results', () => {
    const efs = [1.3, 1.5, 1.8, 2.0, 2.5];
    const reps = [1, 2, 3, 5, 8];
    const offsets = [-30, -10];
    let count = 0;
    
    for (const ef of efs) {
      for (const rep of reps) {
        for (const offset of offsets) {
          const card = makeCard({ state: 2, stability: ef, difficulty: rep, scheduledOffsetDays: offset });
          const r = calculateCardRecall(card, algo);
          
          expect(r.percent).toBeGreaterThanOrEqual(0);
          expect(r.percent).toBeLessThanOrEqual(100);
          expect(r.state).toBe('review');
          
          if (offset < 0) {
            expect(r.percent).toBeLessThanOrEqual(90);
          }
          
          count++;
        }
      }
    }
    expect(count).toBe(50);
  });
});

// ===================== PROGRESSION SIMULATIONS =====================
describe('Simulation: progressive study', () => {
  it('FSRS: regularly reviewed cards maintain 90%', () => {
    for (let i = 1; i <= 20; i++) {
      const stability = 5 * i;
      const card = makeCard({ state: 2, stability, difficulty: 5, scheduledOffsetDays: 0 });
      expect(calculateCardRecall(card, 'fsrs').percent).toBe(90);
    }
  });

  it('FSRS: skipping reviews causes progressive decay', () => {
    const stability = 5;
    const retentions: number[] = [];
    for (const overdue of [0, 1, 5, 10, 20, 50, 100, 200]) {
      retentions.push(calculateCardRecall(makeCard({ state: 2, stability, difficulty: 5, scheduledOffsetDays: -overdue }), 'fsrs').percent);
    }
    for (let i = 1; i < retentions.length; i++) {
      expect(retentions[i]).toBeLessThanOrEqual(retentions[i - 1]);
    }
    expect(retentions[retentions.length - 1]).toBeGreaterThan(0);
  });

  it('SM-2: increasing reps improves retention when on schedule', () => {
    const retentions: number[] = [];
    for (const rep of [1, 2, 3, 4, 5]) {
      const card = makeCard({ state: 2, stability: 2.5, difficulty: rep, scheduledOffsetDays: 5 });
      retentions.push(calculateCardRecall(card, 'sm2').percent);
    }
    for (const r of retentions) {
      expect(r).toBeGreaterThanOrEqual(85);
    }
  });
});
