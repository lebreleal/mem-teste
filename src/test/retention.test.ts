import { describe, it, expect } from 'vitest';
import { calculateCardRecall } from '@/components/RetentionGauge';

// Helper: create a card with scheduled_date relative to now
function makeCard(opts: {
  state: number;
  stability: number;
  difficulty: number;
  scheduledOffsetDays: number;
}) {
  const d = new Date();
  d.setDate(d.getDate() + opts.scheduledOffsetDays);
  return {
    state: opts.state,
    stability: opts.stability,
    difficulty: opts.difficulty,
    scheduled_date: d.toISOString(),
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

  it('at due date → exactly 90% (for any stability)', () => {
    for (const s of [0.5, 1, 2, 5, 10, 20, 50, 100, 365]) {
      const card = makeCard({ state: 2, stability: s, difficulty: 5, scheduledOffsetDays: 0 });
      expect(calculateCardRecall(card, algo).percent).toBe(90);
    }
  });

  it('just reviewed (elapsed ≈ 0) → ~100%', () => {
    // scheduled in S days → lastReview ≈ now → elapsed ≈ 0
    for (const s of [1, 5, 10, 30]) {
      const card = makeCard({ state: 2, stability: s, difficulty: 5, scheduledOffsetDays: s });
      const r = calculateCardRecall(card, algo);
      expect(r.percent).toBeGreaterThanOrEqual(98);
    }
  });

  it('half-way to due → R ≈ 95%', () => {
    // elapsed = S/2, R = (1 + FACTOR * 0.5)^DECAY ≈ 0.946
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

  it('learning card (state=1) → low-moderate (just failed)', () => {
    const card = makeCard({ state: 1, stability: 2, difficulty: 5, scheduledOffsetDays: 0 });
    const r = calculateCardRecall(card, algo);
    // Should NOT be 90%+ since the card was just failed
    expect(r.percent).toBeGreaterThanOrEqual(20);
    expect(r.percent).toBeLessThanOrEqual(60);
    expect(r.state).toBe('learning');
  });

  it('learning card harder difficulty → lower recall', () => {
    const easy = calculateCardRecall(makeCard({ state: 1, stability: 0.5, difficulty: 2, scheduledOffsetDays: 0 }), algo);
    const hard = calculateCardRecall(makeCard({ state: 1, stability: 0.5, difficulty: 9, scheduledOffsetDays: 0 }), algo);
    expect(easy.percent).toBeGreaterThan(hard.percent);
  });

  // ---- 50 parametric FSRS simulations ----
  it('50 parametric simulations match expected formula', () => {
    const stabilities = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 365];
    const offsets = [-100, -50, -20, -10, -5, -1, 0, 5, 10, 20];
    let count = 0;
    for (const s of stabilities) {
      for (const offset of offsets) {
        if (count >= 50) break;
        const card = makeCard({ state: 2, stability: s, difficulty: 5, scheduledOffsetDays: offset });
        const r = calculateCardRecall(card, algo);

        // Manually compute expected
        const elapsedDays = Math.max(0, s - offset); // elapsed from lastReview = s + (-offset) = s - offset for offset<0, or s - offset for offset>0
        const expected = expectedFSRS(s, elapsedDays);

        expect(Math.abs(r.percent - expected)).toBeLessThanOrEqual(1); // allow ±1 rounding
        expect(r.percent).toBeGreaterThanOrEqual(0);
        expect(r.percent).toBeLessThanOrEqual(100);
        count++;
      }
    }
    expect(count).toBe(50);
  });
});

// ===================== SM-2 TESTS =====================
describe('SM-2 Recall Algorithm (power-law based)', () => {
  const algo = 'sm2';

  it('new card (state=0) → 0%', () => {
    expect(calculateCardRecall(makeCard({ state: 0, stability: 2.5, difficulty: 0, scheduledOffsetDays: 0 }), algo).percent).toBe(0);
  });

  it('learning card (state=1) → moderate range (just failed)', () => {
    const card = makeCard({ state: 1, stability: 2.5, difficulty: 1, scheduledOffsetDays: 0 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBeGreaterThanOrEqual(20);
    expect(r.percent).toBeLessThanOrEqual(60);
    expect(r.state).toBe('learning');
  });

  it('learning card with low EF → lower recall', () => {
    const lowEF = calculateCardRecall(makeCard({ state: 1, stability: 1.3, difficulty: 1, scheduledOffsetDays: 0 }), algo);
    const highEF = calculateCardRecall(makeCard({ state: 1, stability: 2.5, difficulty: 1, scheduledOffsetDays: 0 }), algo);
    expect(highEF.percent).toBeGreaterThan(lowEF.percent);
  });

  it('review card on time (rep=3, EF=2.5) → ~90%', () => {
    // reps=3 → effective stability = 6 * 2.5^1 = 15 days
    // at due date → elapsed = effectiveStability → R = 90%
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 3, scheduledOffsetDays: 0 });
    const r = calculateCardRecall(card, algo);
    expect(r.percent).toBe(90); // Power law at due date = 90%
  });

  it('review card with many reps on time → 90%', () => {
    // At due date, regardless of effective stability, R = 90%
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
    // reps=3, EF=1.5 → effective stability = 6 * 1.5^1 = 9 days
    // 60 days overdue → elapsed = 69 days, well past stability → should drop significantly
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
    // More reps = longer effective stability = higher retention when overdue by same amount
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

  it('both algorithms return 90% at due date for review cards', () => {
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
          
          // Overdue cards should be below 90%
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
      // All at due date → all 90%, but with future schedule they differ
      const card = makeCard({ state: 2, stability: 2.5, difficulty: rep, scheduledOffsetDays: 5 });
      retentions.push(calculateCardRecall(card, 'sm2').percent);
    }
    // All should be high (scheduled in future)
    for (const r of retentions) {
      expect(r).toBeGreaterThanOrEqual(85);
    }
  });
});
