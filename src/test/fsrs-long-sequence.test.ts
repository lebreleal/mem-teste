import { describe, it, expect } from 'vitest';
import { fsrsSchedule, FSRSCard, FSRSParams, DEFAULT_FSRS_PARAMS, Rating } from '@/lib/fsrs';

/**
 * Helper: simulate a full review chain starting from a new card.
 * Returns the history of intervals produced.
 */
function simulateChain(
  ratings: Rating[],
  params: FSRSParams = DEFAULT_FSRS_PARAMS,
): { intervals: number[]; finalStability: number; finalDifficulty: number; states: number[] } {
  let card: FSRSCard = {
    stability: 0,
    difficulty: 0,
    state: 0,
    scheduled_date: new Date().toISOString(),
    learning_step: 0,
  };

  const intervals: number[] = [];
  const states: number[] = [];

  for (const rating of ratings) {
    // Simulate reviewing at the scheduled time by advancing "now"
    // For learning cards (interval_days=0), we review when the step timer expires
    // For review cards, we review on the scheduled date
    const reviewTime = new Date(card.scheduled_date);
    // Use a small offset to simulate reviewing shortly after scheduled time
    const reviewNow = new Date(reviewTime.getTime() + 60 * 1000); // 1 min after scheduled

    // Mock Date.now and new Date() to reviewNow
    const originalNow = Date.now;
    const OriginalDate = globalThis.Date;
    const mockNow = reviewNow.getTime();
    
    // Create a proxy Date that uses our mock time
    const MockDate = class extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(mockNow);
        } else {
          super(...(args as [any]));
        }
      }
      static now() { return mockNow; }
    } as DateConstructor;
    globalThis.Date = MockDate;

    const result = fsrsSchedule(card, rating, params);
    
    globalThis.Date = OriginalDate;

    intervals.push(result.interval_days);
    states.push(result.state);

    card = {
      stability: result.stability,
      difficulty: result.difficulty,
      state: result.state,
      scheduled_date: result.scheduled_date,
      learning_step: result.learning_step,
      last_reviewed_at: reviewNow.toISOString(),
    };
  }

  return {
    intervals,
    finalStability: card.stability,
    finalDifficulty: card.difficulty,
    states,
  };
}

/**
 * Helper: simulate reviewing on time, skipping learning steps automatically
 * by pressing Good until graduated, then applying the given ratings.
 */
function simulateWithGraduation(
  reviewRatings: Rating[],
  params: FSRSParams = DEFAULT_FSRS_PARAMS,
): { intervals: number[]; states: number[]; finalStability: number } {
  // First graduate: New → Good (step 0→1) → Good (step 1→graduate)
  const graduationRatings: Rating[] = [3, 3]; // Good, Good to graduate with default 2 steps
  const allRatings = [...graduationRatings, ...reviewRatings];
  return simulateChain(allRatings, params);
}

describe('FSRS Long Sequence Tests', () => {
  
  describe('Graduation flow', () => {
    it('New → Good → Good should graduate to review (state 2)', () => {
      const result = simulateChain([3, 3]);
      // First Good: state 1 (learning step 1), interval 0
      expect(result.states[0]).toBe(1);
      expect(result.intervals[0]).toBe(0);
      // Second Good: state 2 (review), interval > 0
      expect(result.states[1]).toBe(2);
      expect(result.intervals[1]).toBeGreaterThan(0);
    });

    it('New → Easy should graduate immediately with bonus', () => {
      const result = simulateChain([4]);
      expect(result.states[0]).toBe(2);
      expect(result.intervals[0]).toBeGreaterThanOrEqual(4);
    });
  });

  describe('All-Good sequence should produce growing intervals', () => {
    it('10 consecutive Good reviews should reach multi-day intervals', () => {
      const ratings: Rating[] = [3, 3, 3, 3, 3, 3, 3, 3, 3, 3];
      const result = simulateChain(ratings);
      
      // After graduation (first 2 Goods), intervals should grow
      const reviewIntervals = result.intervals.filter(i => i > 0);
      console.log('All-Good intervals:', result.intervals);
      console.log('All-Good states:', result.states);
      
      expect(reviewIntervals.length).toBeGreaterThan(0);
      // Each subsequent review interval should be >= previous
      for (let i = 1; i < reviewIntervals.length; i++) {
        expect(reviewIntervals[i]).toBeGreaterThanOrEqual(reviewIntervals[i - 1]);
      }
    });

    it('20 consecutive Good reviews should reach 100+ day intervals', () => {
      const ratings: Rating[] = Array(20).fill(3);
      const result = simulateChain(ratings);
      const reviewIntervals = result.intervals.filter(i => i > 0);
      console.log('20 Good intervals:', reviewIntervals);
      
      const maxInterval = Math.max(...reviewIntervals);
      expect(maxInterval).toBeGreaterThan(100);
    });

    it('30 consecutive Good reviews should reach 300+ day intervals', () => {
      const ratings: Rating[] = Array(30).fill(3);
      const result = simulateChain(ratings);
      const reviewIntervals = result.intervals.filter(i => i > 0);
      console.log('30 Good intervals:', reviewIntervals);
      
      const maxInterval = Math.max(...reviewIntervals);
      expect(maxInterval).toBeGreaterThan(300);
    });
  });

  describe('All-Easy sequence should grow even faster', () => {
    it('15 consecutive Easy reviews should reach 300+ days', () => {
      const ratings: Rating[] = Array(15).fill(4);
      const result = simulateChain(ratings);
      const reviewIntervals = result.intervals.filter(i => i > 0);
      console.log('All-Easy intervals:', reviewIntervals);
      
      const maxInterval = Math.max(...reviewIntervals);
      expect(maxInterval).toBeGreaterThan(300);
    });
  });

  describe('Hard should still progress (slower)', () => {
    it('Graduate then 10 Hard reviews should still increase intervals', () => {
      const result = simulateWithGraduation(Array(10).fill(2));
      const reviewIntervals = result.intervals.filter(i => i > 0);
      console.log('All-Hard intervals:', reviewIntervals);
      
      // Hard should still eventually grow, just slower
      expect(reviewIntervals[reviewIntervals.length - 1]).toBeGreaterThan(1);
    });
  });

  describe('Again then recovery', () => {
    it('Graduate → Again → Good×10 should recover and grow', () => {
      const result = simulateWithGraduation([1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
      console.log('Again-recovery intervals:', result.intervals);
      console.log('Again-recovery states:', result.states);
      
      const lastIntervals = result.intervals.slice(-3);
      // Should be growing after recovery
      expect(lastIntervals[lastIntervals.length - 1]).toBeGreaterThan(5);
    });

    it('Multiple Again does not permanently stall at 1d', () => {
      // Simulate: graduate, then Again 3 times, then Good 10 times
      const result = simulateWithGraduation([1, 1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
      console.log('Multi-Again-recovery intervals:', result.intervals);
      console.log('Multi-Again-recovery states:', result.states);
      
      const last = result.intervals[result.intervals.length - 1];
      expect(last).toBeGreaterThan(5);
    });
  });

  describe('Mixed rating patterns', () => {
    it('Alternating Good/Hard should still progress', () => {
      const ratings: Rating[] = [];
      // Graduate
      ratings.push(3, 3);
      // Alternate Good/Hard 10 times
      for (let i = 0; i < 10; i++) {
        ratings.push(i % 2 === 0 ? 3 : 2);
      }
      const result = simulateChain(ratings);
      console.log('Good/Hard alternating intervals:', result.intervals);
      
      const reviewIntervals = result.intervals.filter(i => i > 0);
      expect(reviewIntervals[reviewIntervals.length - 1]).toBeGreaterThan(3);
    });

    it('Good×5 → Again → Good×5 → Again → Good×5 should show recovery pattern', () => {
      const result = simulateWithGraduation([
        3, 3, 3, 3, 3,    // 5 Good
        1,                  // Again (lapse)
        3, 3, 3, 3, 3,    // 5 Good recovery
        1,                  // Again (lapse)
        3, 3, 3, 3, 3,    // 5 Good recovery
      ]);
      console.log('Lapse-recovery pattern intervals:', result.intervals);
      console.log('Lapse-recovery pattern states:', result.states);
      
      // After each recovery, intervals should grow
      const finalInterval = result.intervals[result.intervals.length - 1];
      expect(finalInterval).toBeGreaterThan(1);
    });

    it('Easy → Hard → Good → Again → Easy → Good×10 should reach high intervals', () => {
      const result = simulateWithGraduation([4, 2, 3, 1, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3]);
      console.log('Mixed pattern intervals:', result.intervals);
      
      const finalInterval = result.intervals[result.intervals.length - 1];
      expect(finalInterval).toBeGreaterThan(30);
    });
  });

  describe('Edge case: repeated Again should not break', () => {
    it('5 consecutive Again from review should enter relearning and recover', () => {
      const result = simulateWithGraduation([1, 1, 1, 1, 1, 3, 3, 3, 3, 3]);
      console.log('5 Again then recovery intervals:', result.intervals);
      console.log('5 Again then recovery states:', result.states);
      
      // After recovery Goods, should be in review state
      const lastState = result.states[result.states.length - 1];
      expect(lastState).toBe(2);
      
      const lastInterval = result.intervals[result.intervals.length - 1];
      expect(lastInterval).toBeGreaterThan(1);
    });
  });

  describe('Stability growth verification', () => {
    it('Stability should increase with each successful review', () => {
      let card: FSRSCard = {
        stability: 0, difficulty: 0, state: 0,
        scheduled_date: new Date().toISOString(), learning_step: 0,
      };

      const stabilities: number[] = [];
      
      // Graduate
      for (const r of [3, 3] as Rating[]) {
        const res = fsrsSchedule(card, r);
        card = { stability: res.stability, difficulty: res.difficulty, state: res.state, scheduled_date: res.scheduled_date, learning_step: res.learning_step };
      }
      stabilities.push(card.stability);

      // 10 Good reviews
      for (let i = 0; i < 10; i++) {
        const res = fsrsSchedule(card, 3);
        card = { stability: res.stability, difficulty: res.difficulty, state: res.state, scheduled_date: res.scheduled_date, learning_step: res.learning_step };
        if (card.state === 2) stabilities.push(card.stability);
      }

      console.log('Stability progression:', stabilities);
      
      // Each stability should be > previous
      for (let i = 1; i < stabilities.length; i++) {
        expect(stabilities[i]).toBeGreaterThan(stabilities[i - 1]);
      }
    });
  });

  describe('Same-day review edge case', () => {
    it('Reviewing immediately after graduation should not stall', () => {
      let card: FSRSCard = {
        stability: 0, difficulty: 0, state: 0,
        scheduled_date: new Date().toISOString(), learning_step: 0,
      };

      // Graduate with Good, Good
      let res = fsrsSchedule(card, 3);
      card = { stability: res.stability, difficulty: res.difficulty, state: res.state, scheduled_date: res.scheduled_date, learning_step: res.learning_step };
      res = fsrsSchedule(card, 3);
      card = { stability: res.stability, difficulty: res.difficulty, state: res.state, scheduled_date: res.scheduled_date, learning_step: res.learning_step };
      
      expect(card.state).toBe(2);
      console.log('After graduation - stability:', card.stability, 'interval:', res.interval_days, 'scheduled:', card.scheduled_date);
      
      // Now simulate reviewing ON the scheduled date (elapsedDays ≈ interval)
      // The scheduled_date is midnight N days from now
      // If we review at that time, elapsedDays should be ≈ interval
      const res2 = fsrsSchedule(card, 3);
      console.log('Same-day review result:', res2);
      
      // Even if same-day, the interval should still be > 0
      expect(res2.interval_days).toBeGreaterThan(0);
    });
  });

  describe('Interval never stuck at 1d', () => {
    it('No matter the pattern, 15+ Good reviews should exceed 10d', () => {
      const patterns: Rating[][] = [
        [1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        [2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        [1, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        [1, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
        [3, 1, 3, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      ];

      for (const reviewRatings of patterns) {
        const result = simulateWithGraduation(reviewRatings);
        const lastInterval = result.intervals[result.intervals.length - 1];
        console.log(`Pattern ${reviewRatings.join(',')}: last interval = ${lastInterval}`);
        expect(lastInterval).toBeGreaterThan(10);
      }
    });
  });
});
