// FSRS (Free Spaced Repetition Scheduler) - Optimized Implementation
// Based on the FSRS-4.5 algorithm with proper elapsed days handling

export interface FSRSCard {
  stability: number;
  difficulty: number;
  state: number; // 0=new, 1=learning, 2=review
  scheduled_date: string;
}

export interface FSRSOutput {
  stability: number;
  difficulty: number;
  state: number;
  scheduled_date: string;
  interval_days: number;
}

// Rating: 1=Again, 2=Hard, 3=Good, 4=Easy
export type Rating = 1 | 2 | 3 | 4;

// FSRS-4.5 default parameters (optimized)
const DEFAULT_W = [0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 0.94, 2.18, 0.05, 0.34, 1.26, 0.29, 2.61];

export interface FSRSParams {
  w: number[];
  requestedRetention: number;
  maximumInterval: number;
  learningSteps: number[]; // minutes
  relearningSteps: number[]; // minutes
}

export const DEFAULT_FSRS_PARAMS: FSRSParams = {
  w: DEFAULT_W,
  requestedRetention: 0.9,
  maximumInterval: 36500,
  learningSteps: [1, 10],
  relearningSteps: [10],
};

const DECAY = -0.5;
const FACTOR = 19 / 81;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function initStability(w: number[], rating: Rating): number {
  return Math.max(w[rating - 1], 0.1);
}

function initDifficulty(w: number[], rating: Rating): number {
  const d = w[4] - Math.exp(w[5] * (rating - 1)) + 1;
  return clamp(d, 1, 10);
}

function nextDifficulty(w: number[], d: number, rating: Rating): number {
  const newD = d - w[6] * (rating - 3);
  const meanReverted = w[7] * initDifficulty(w, 4) + (1 - w[7]) * newD;
  return clamp(meanReverted, 1, 10);
}

function retrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + FACTOR * elapsedDays / stability, DECAY);
}

function nextRecallStability(w: number[], d: number, s: number, r: number, rating: Rating): number {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hardPenalty * easyBonus);
}

function nextForgetStability(w: number[], d: number, s: number, r: number): number {
  return Math.max(0.1, w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]));
}

function stabilityToInterval(stability: number, requestedRetention: number, maximumInterval: number): number {
  const interval = Math.round(stability / FACTOR * (Math.pow(requestedRetention, 1 / DECAY) - 1));
  return clamp(interval, 1, maximumInterval);
}

// Main FSRS function with configurable params
export function fsrsSchedule(card: FSRSCard, rating: Rating, params: FSRSParams = DEFAULT_FSRS_PARAMS): FSRSOutput {
  const now = new Date();
  const { w, requestedRetention, maximumInterval, learningSteps, relearningSteps } = params;

  if (card.state === 0) {
    // New card
    const s = initStability(w, rating);
    const d = initDifficulty(w, rating);

    if (rating === 1) {
      // Again → learning state, use first learning step
      const stepMinutes = learningSteps[0] ?? 1;
      const scheduledDate = new Date(now.getTime() + stepMinutes * 60 * 1000);
      return { stability: s, difficulty: d, state: 1, scheduled_date: scheduledDate.toISOString(), interval_days: 0 };
    }

    if (rating === 2) {
      // Hard → learning, second step or first
      const stepMinutes = learningSteps.length > 1 ? learningSteps[1] : learningSteps[0] ?? 10;
      const scheduledDate = new Date(now.getTime() + stepMinutes * 60 * 1000);
      return { stability: s, difficulty: d, state: 1, scheduled_date: scheduledDate.toISOString(), interval_days: 0 };
    }

    // Good or Easy → review
    const interval = stabilityToInterval(s, requestedRetention, maximumInterval);
    const finalInterval = rating === 4 ? Math.max(interval, 4) : interval;
    const scheduledDate = new Date(now);
    scheduledDate.setDate(scheduledDate.getDate() + finalInterval);
    return { stability: s, difficulty: d, state: 2, scheduled_date: scheduledDate.toISOString(), interval_days: finalInterval };
  }

  if (card.state === 1) {
    // Learning card
    const s = card.stability > 0 ? card.stability : initStability(w, rating);
    const d = card.difficulty > 0 ? nextDifficulty(w, card.difficulty, rating) : initDifficulty(w, rating);

    if (rating === 1) {
      const stepMinutes = relearningSteps[0] ?? learningSteps[0] ?? 1;
      const scheduledDate = new Date(now.getTime() + stepMinutes * 60 * 1000);
      return { stability: Math.max(s * 0.5, 0.1), difficulty: d, state: 1, scheduled_date: scheduledDate.toISOString(), interval_days: 0 };
    }

    if (rating === 2) {
      const stepMinutes = learningSteps.length > 1 ? learningSteps[1] : (learningSteps[0] ?? 10);
      const scheduledDate = new Date(now.getTime() + stepMinutes * 60 * 1000);
      return { stability: s, difficulty: d, state: 1, scheduled_date: scheduledDate.toISOString(), interval_days: 0 };
    }

    // Good or Easy → graduate to review
    const interval = stabilityToInterval(s, requestedRetention, maximumInterval);
    const finalInterval = rating === 4 ? Math.max(interval, 4) : Math.max(interval, 1);
    const scheduledDate = new Date(now);
    scheduledDate.setDate(scheduledDate.getDate() + finalInterval);
    return { stability: s, difficulty: d, state: 2, scheduled_date: scheduledDate.toISOString(), interval_days: finalInterval };
  }

  // Review card (state === 2)
  const scheduledTime = new Date(card.scheduled_date).getTime();
  const elapsedDays = Math.max(0, (now.getTime() - scheduledTime) / (1000 * 60 * 60 * 24));
  const r = retrievability(card.stability, elapsedDays);
  const d = nextDifficulty(w, card.difficulty, rating);

  if (rating === 1) {
    // Again → relearning
    const s = nextForgetStability(w, card.difficulty, card.stability, r);
    const stepMinutes = relearningSteps[0] ?? 10;
    const scheduledDate = new Date(now.getTime() + stepMinutes * 60 * 1000);
    return { stability: s, difficulty: d, state: 1, scheduled_date: scheduledDate.toISOString(), interval_days: 0 };
  }

  // Hard, Good, Easy → recall
  const s = nextRecallStability(w, card.difficulty, card.stability, r, rating);
  const interval = stabilityToInterval(s, requestedRetention, maximumInterval);

  // Enforce minimum intervals: hard >= current, good >= hard, easy >= good
  const currentInterval = Math.max(1, Math.round(elapsedDays));
  let finalInterval = interval;
  if (rating === 2) {
    finalInterval = Math.max(interval, currentInterval);
  } else if (rating === 3) {
    finalInterval = Math.max(interval, currentInterval + 1);
  } else {
    finalInterval = Math.max(interval, currentInterval + 2);
  }
  finalInterval = Math.min(finalInterval, maximumInterval);

  const scheduledDate = new Date(now);
  scheduledDate.setDate(scheduledDate.getDate() + finalInterval);
  return { stability: s, difficulty: d, state: 2, scheduled_date: scheduledDate.toISOString(), interval_days: finalInterval };
}

// Preview intervals for all ratings
export function fsrsPreviewIntervals(card: FSRSCard, params: FSRSParams = DEFAULT_FSRS_PARAMS): Record<Rating, string> {
  const results = {} as Record<Rating, string>;
  for (const rating of [1, 2, 3, 4] as Rating[]) {
    const output = fsrsSchedule(card, rating, params);
    results[rating] = formatInterval(output);
  }
  return results;
}

function formatInterval(output: FSRSOutput): string {
  if (output.interval_days === 0) {
    const diffMs = new Date(output.scheduled_date).getTime() - Date.now();
    const mins = Math.max(1, Math.round(diffMs / (1000 * 60)));
    if (mins < 60) return `${mins}min`;
    return `${Math.round(mins / 60)}h`;
  }
  if (output.interval_days === 1) return '1d';
  if (output.interval_days < 30) return `${output.interval_days}d`;
  if (output.interval_days < 365) return `${Math.round(output.interval_days / 30)}m`;
  return `${(output.interval_days / 365).toFixed(1)}a`;
}
