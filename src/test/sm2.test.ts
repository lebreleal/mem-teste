import { describe, it, expect } from 'vitest';
import { sm2Schedule, type SM2Card, type SM2Params, DEFAULT_SM2_PARAMS } from '@/lib/sm2';

function makeCard(overrides: Partial<SM2Card> = {}): SM2Card {
  return {
    stability: 0,    // EFactor
    difficulty: 0,    // reps
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

const params: SM2Params = {
  learningSteps: [1, 10],
  easyBonus: 1.3,
  intervalModifier: 1.0,
  maxInterval: 36500,
};

describe('SM-2 Algorithm - New Cards (state=0)', () => {
  it('1. Again on new card → learning state, 1min step', () => {
    const r = sm2Schedule(makeCard(), 1, params);
    expect(r.state).toBe(1);
    expect(r.interval_days).toBe(0);
    expect(minutesFromNow(r)).toBeCloseTo(1, 0);
  });

  it('2. Hard on new card → learning state, 10min step', () => {
    const r = sm2Schedule(makeCard(), 2, params);
    expect(r.state).toBe(1);
    expect(r.interval_days).toBe(0);
    expect(minutesFromNow(r)).toBeCloseTo(10, 0);
  });

  it('3. Good on new card → graduate to review, 1d interval', () => {
    const r = sm2Schedule(makeCard(), 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBe(1);
    expect(r.difficulty).toBe(1); // first rep
  });

  it('4. Easy on new card → graduate to review, ~5d interval (4 * 1.3)', () => {
    const r = sm2Schedule(makeCard(), 4, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBe(5); // 4 * 1.3 = 5.2 → 5
    expect(r.difficulty).toBe(1);
  });

  it('5. EFactor initialized at 2.5 for new card rated Good', () => {
    const r = sm2Schedule(makeCard(), 3, params);
    expect(r.stability).toBeGreaterThanOrEqual(1.3);
    expect(r.stability).toBeLessThanOrEqual(2.7);
  });

  it('6. EFactor initialized at 2.5 for new card rated Again', () => {
    const r = sm2Schedule(makeCard(), 1, params);
    expect(r.stability).toBeGreaterThanOrEqual(1.3);
  });

  it('7. New card with single learning step - Hard uses same step', () => {
    const p = { ...params, learningSteps: [5] };
    const r = sm2Schedule(makeCard(), 2, p);
    expect(minutesFromNow(r)).toBeCloseTo(5, 0);
  });

  it('8. New card with 3 learning steps - Hard uses second step', () => {
    const p = { ...params, learningSteps: [1, 10, 30] };
    const r = sm2Schedule(makeCard(), 2, p);
    expect(minutesFromNow(r)).toBeCloseTo(10, 0);
  });

  it('9. New card with interval modifier 0.5 - graduation halved', () => {
    const p = { ...params, intervalModifier: 0.5 };
    const r = sm2Schedule(makeCard(), 3, p);
    expect(r.interval_days).toBe(1); // max(round(1*0.5), 1) = 1
  });

  it('10. New card Easy with high easy bonus', () => {
    const p = { ...params, easyBonus: 2.0 };
    const r = sm2Schedule(makeCard(), 4, p);
    expect(r.interval_days).toBe(8); // 4 * 2.0 = 8
  });
});

describe('SM-2 Algorithm - Learning Cards (state=1)', () => {
  const learningCard = makeCard({ state: 1, stability: 2.5, difficulty: 0 });

  it('11. Again on learning → stay in learning, 1min', () => {
    const r = sm2Schedule(learningCard, 1, params);
    expect(r.state).toBe(1);
    expect(minutesFromNow(r)).toBeCloseTo(1, 0);
    expect(r.difficulty).toBe(0); // reps reset
  });

  it('12. Hard on learning → stay in learning, 10min', () => {
    const r = sm2Schedule(learningCard, 2, params);
    expect(r.state).toBe(1);
    expect(minutesFromNow(r)).toBeCloseTo(10, 0);
  });

  it('13. Good on learning → graduate to review', () => {
    const r = sm2Schedule(learningCard, 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBe(1);
  });

  it('14. Easy on learning → graduate with 4d+ interval', () => {
    const r = sm2Schedule(learningCard, 4, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBeGreaterThanOrEqual(4);
  });

  it('15. EFactor decreases on Again in learning', () => {
    const card = makeCard({ state: 1, stability: 2.5, difficulty: 0 });
    const r = sm2Schedule(card, 1, params);
    expect(r.stability).toBeLessThan(2.5);
    expect(r.stability).toBeGreaterThanOrEqual(1.3);
  });
});

describe('SM-2 Algorithm - Review Cards (state=2)', () => {
  it('16. Again on review → lapse to learning', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 1, scheduled_date: new Date(Date.now() - 86400000).toISOString() });
    const r = sm2Schedule(card, 1, params);
    expect(r.state).toBe(3); // relearning state
    expect(r.difficulty).toBe(0); // reps reset
  });

  it('17. Good on first review (reps=1) → 6d interval', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 1, scheduled_date: new Date(Date.now() - 86400000).toISOString() });
    const r = sm2Schedule(card, 3, params);
    expect(r.state).toBe(2);
    expect(r.interval_days).toBe(6);
    expect(r.difficulty).toBe(2); // reps incremented
  });

  it('18. Good on second review (reps=2) → ~15d (6 * 2.5)', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 2, scheduled_date: new Date(Date.now() - 6 * 86400000).toISOString() });
    const r = sm2Schedule(card, 3, params);
    expect(r.interval_days).toBeGreaterThanOrEqual(12);
    expect(r.interval_days).toBeLessThanOrEqual(18);
  });

  it('19. Hard on review → 20% shorter interval', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 2, scheduled_date: new Date(Date.now() - 6 * 86400000).toISOString() });
    const rGood = sm2Schedule(card, 3, params);
    const rHard = sm2Schedule(card, 2, params);
    expect(rHard.interval_days).toBeLessThan(rGood.interval_days);
  });

  it('20. Easy on review → longer interval with bonus', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 2, scheduled_date: new Date(Date.now() - 6 * 86400000).toISOString() });
    const rGood = sm2Schedule(card, 3, params);
    const rEasy = sm2Schedule(card, 4, params);
    expect(rEasy.interval_days).toBeGreaterThan(rGood.interval_days);
  });

  it('21. EFactor decreases on Hard review', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 3, scheduled_date: new Date(Date.now() - 15 * 86400000).toISOString() });
    const r = sm2Schedule(card, 2, params);
    expect(r.stability).toBeLessThan(2.5);
  });

  it('22. EFactor increases on Easy review', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 3, scheduled_date: new Date(Date.now() - 15 * 86400000).toISOString() });
    const r = sm2Schedule(card, 4, params);
    expect(r.stability).toBeGreaterThan(2.5);
  });

  it('23. EFactor never goes below 1.3', () => {
    const card = makeCard({ state: 2, stability: 1.3, difficulty: 5, scheduled_date: new Date(Date.now() - 86400000).toISOString() });
    const r = sm2Schedule(card, 1, params);
    expect(r.stability).toBeGreaterThanOrEqual(1.3);
  });

  it('24. Max interval respected', () => {
    const p = { ...params, maxInterval: 30 };
    const card = makeCard({ state: 2, stability: 3.0, difficulty: 10, scheduled_date: new Date(Date.now() - 100 * 86400000).toISOString() });
    const r = sm2Schedule(card, 4, p);
    expect(r.interval_days).toBeLessThanOrEqual(30);
  });

  it('25. Interval modifier 1.5 increases intervals', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 1, scheduled_date: new Date(Date.now() - 86400000).toISOString() });
    const rNormal = sm2Schedule(card, 3, params);
    const rMod = sm2Schedule(card, 3, { ...params, intervalModifier: 1.5 });
    expect(rMod.interval_days).toBeGreaterThanOrEqual(rNormal.interval_days);
  });

  it('26. Reps counter increments on success', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 5, scheduled_date: new Date(Date.now() - 30 * 86400000).toISOString() });
    const r = sm2Schedule(card, 3, params);
    expect(r.difficulty).toBe(6);
  });

  it('27. Reps resets to 0 on lapse', () => {
    const card = makeCard({ state: 2, stability: 2.5, difficulty: 5, scheduled_date: new Date(Date.now() - 30 * 86400000).toISOString() });
    const r = sm2Schedule(card, 1, params);
    expect(r.difficulty).toBe(0);
  });

  it('28. Multiple lapses keep EF above minimum', () => {
    let card = makeCard({ state: 2, stability: 2.0, difficulty: 3, scheduled_date: new Date(Date.now() - 10 * 86400000).toISOString() });
    for (let i = 0; i < 5; i++) {
      const r = sm2Schedule(card, 1, params);
      expect(r.stability).toBeGreaterThanOrEqual(1.3);
      card = { ...card, stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: r.scheduled_date };
    }
  });

  it('29. Interval always >= 1 day for review', () => {
    const card = makeCard({ state: 2, stability: 1.3, difficulty: 0, scheduled_date: new Date().toISOString() });
    const r = sm2Schedule(card, 2, params);
    expect(r.interval_days).toBeGreaterThanOrEqual(1);
  });

  it('30. Long progression: intervals grow correctly', () => {
    let card = makeCard();
    // Graduate with Good
    let r = sm2Schedule(card, 3, params);
    expect(r.state).toBe(2);
    let prevInterval = r.interval_days;
    card = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: r.scheduled_date };

    // 5 successive Good reviews - intervals should grow
    for (let i = 0; i < 5; i++) {
      // Simulate time passing
      const pastDate = new Date(Date.now() - prevInterval * 86400000).toISOString();
      card.scheduled_date = pastDate;
      r = sm2Schedule(card, 3, params);
      expect(r.interval_days).toBeGreaterThanOrEqual(prevInterval);
      prevInterval = r.interval_days;
      card = { stability: r.stability, difficulty: r.difficulty, state: r.state, scheduled_date: r.scheduled_date };
    }
  });
});
