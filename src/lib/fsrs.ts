// FSRS (Free Spaced Repetition Scheduler) - FSRS-6 Implementation
// Based on the official FSRS-6 algorithm with 21 parameters
// https://github.com/open-spaced-repetition/fsrs4anki/wiki/The-Algorithm

export interface FSRSCard {
  stability: number;
  difficulty: number;
  state: number; // 0=new, 1=learning, 2=review, 3=relearning
  scheduled_date: string;
  learning_step?: number; // current step index in learningSteps/relearningSteps
  last_reviewed_at?: string; // ISO date of last review — used to compute real elapsed days
}

export interface FSRSOutput {
  stability: number;
  difficulty: number;
  state: number;
  scheduled_date: string;
  interval_days: number;
  learning_step: number;
}

// Rating: 1=Again, 2=Hard, 3=Good, 4=Easy
export type Rating = 1 | 2 | 3 | 4;

// FSRS-6 default parameters (21 weights)
const DEFAULT_W = [
  0.212, 1.2931, 2.3065, 8.2956,   // w0-w3: initial stability per rating
  6.4133,                            // w4: initial difficulty base
  0.8334,                            // w5: initial difficulty scaling
  3.0194,                            // w6: difficulty change factor
  0.001,                             // w7: mean reversion weight
  1.8722,                            // w8: recall stability multiplier
  0.1666,                            // w9: recall stability power (S)
  0.796,                             // w10: recall stability R factor
  1.4835,                            // w11: forget stability base
  0.0614,                            // w12: forget stability D power
  0.2629,                            // w13: forget stability S power
  1.6483,                            // w14: forget stability R factor
  0.6014,                            // w15: hard penalty
  1.8729,                            // w16: easy bonus
  0.5425,                            // w17: same-day review base
  0.0912,                            // w18: same-day review offset
  0.0658,                            // w19: same-day review S power
  0.1542,                            // w20: trainable decay
];

export interface FSRSParams {
  w: number[];
  requestedRetention: number;
  maximumInterval: number;
  learningSteps: number[]; // minutes
  relearningSteps: number[]; // minutes
  easyGraduatingInterval: number; // days — max interval when Easy graduates a new/learning card
}

export const DEFAULT_FSRS_PARAMS: FSRSParams = {
  w: DEFAULT_W,
  requestedRetention: 0.85,
  maximumInterval: 36500,
  learningSteps: [1, 10],
  relearningSteps: [10],
  easyGraduatingInterval: 15,
};

// ── Core math helpers ──

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Get the decay value: w[20] if FSRS-6 (21 params), else 0.5 for FSRS-4.5 compat */
function getDecay(w: number[]): number {
  return w.length >= 21 ? w[20] : 0.5;
}

/** Compute the FACTOR constant from the decay value so that R(S,S)=0.9 */
function getFactor(decay: number): number {
  return Math.pow(0.9, -1 / decay) - 1;
}

// ── Stability & Difficulty ──

function initStability(w: number[], rating: Rating): number {
  return Math.max(w[rating - 1], 0.1);
}

function initDifficulty(w: number[], rating: Rating): number {
  const d = w[4] - Math.exp(w[5] * (rating - 1)) + 1;
  return clamp(d, 1, 10);
}

function nextDifficulty(w: number[], d: number, rating: Rating): number {
  const deltaD = -w[6] * (rating - 3);
  const dPrime = d + deltaD * (10 - d) / 9;
  const meanReverted = w[7] * initDifficulty(w, 4) + (1 - w[7]) * dPrime;
  return clamp(meanReverted, 1, 10);
}

function retrievability(w: number[], stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  const decay = getDecay(w);
  const factor = getFactor(decay);
  return Math.pow(1 + factor * elapsedDays / stability, -decay);
}

function sameDayStability(w: number[], s: number, rating: Rating): number {
  if (w.length < 19) return s;
  const w17 = w[17] ?? 0;
  const w18 = w[18] ?? 0;
  const w19 = w.length >= 21 ? (w[19] ?? 0) : 0;
  const sInc = Math.exp(w17 * (rating - 3 + w18) * Math.pow(s, -w19));
  const safeSInc = rating >= 3 ? Math.max(sInc, 1) : sInc;
  return Math.max(s * safeSInc, 0.1);
}

function nextRecallStability(w: number[], d: number, s: number, r: number, rating: Rating): number {
  const hardPenalty = rating === 2 ? w[15] : 1;
  const easyBonus = rating === 4 ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hardPenalty * easyBonus);
}

function nextForgetStability(w: number[], d: number, s: number, r: number): number {
  return Math.max(0.1, w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]));
}

function stabilityToInterval(w: number[], stability: number, requestedRetention: number, maximumInterval: number): number {
  const decay = getDecay(w);
  const factor = getFactor(decay);
  const interval = Math.round(stability / factor * (Math.pow(requestedRetention, -1 / decay) - 1));
  return clamp(interval, 1, maximumInterval);
}

/** Get local midnight N days from now (for day-based intervals). */
function getLocalMidnight(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Helper: schedule a learning/relearning step ──

function scheduleStep(now: Date, stepMinutes: number, s: number, d: number, state: number, step: number): FSRSOutput {
  const scheduledDate = new Date(now.getTime() + stepMinutes * 60 * 1000);
  return { stability: s, difficulty: d, state, scheduled_date: scheduledDate.toISOString(), interval_days: 0, learning_step: step };
}

function graduateToReview(w: number[], s: number, d: number, requestedRetention: number, maximumInterval: number, minDays: number = 1): FSRSOutput {
  const interval = stabilityToInterval(w, s, requestedRetention, maximumInterval);
  const finalInterval = Math.max(interval, minDays);
  const scheduledDate = getLocalMidnight(finalInterval);
  return { stability: s, difficulty: d, state: 2, scheduled_date: scheduledDate.toISOString(), interval_days: finalInterval, learning_step: 0 };
}

// ── Main scheduling function ──

export function fsrsSchedule(card: FSRSCard, rating: Rating, params: FSRSParams = DEFAULT_FSRS_PARAMS): FSRSOutput {
  const now = new Date();
  const { w, requestedRetention, maximumInterval, learningSteps, relearningSteps, easyGraduatingInterval } = params;
  const currentStep = card.learning_step ?? 0;
  const easyGradMax = easyGraduatingInterval ?? 15;

  // ═══ STATE 0: New card ═══
  if (card.state === 0) {
    const s = initStability(w, rating);
    const d = initDifficulty(w, rating);

    if (rating === 1) {
      // Again → learning step 0
      return scheduleStep(now, learningSteps[0] ?? 1, s, d, 1, 0);
    }
    if (rating === 2) {
      // Hard → learning step 0, interval = avg(step[0], step[1]) or step[0]*1.5
      const step0 = learningSteps[0] ?? 1;
      const step1 = learningSteps.length > 1 ? learningSteps[1] : step0;
      const avgMinutes = (step0 + step1) / 2;
      return scheduleStep(now, avgMinutes, s, d, 1, 0);
    }
    if (rating === 3) {
      // Good → advance to next learning step (stay in learning)
      if (learningSteps.length > 1) {
        // Go to step 1, interval = step[1]
        return scheduleStep(now, learningSteps[1], s, d, 1, 1);
      }
      // Only 1 step → graduate
      return graduateToReview(w, s, d, requestedRetention, maximumInterval);
    }
    // Easy → graduate with easy bonus, capped by easyGraduatingInterval
    const easyS = s * w[16];
    return graduateToReview(w, easyS, d, requestedRetention, Math.min(maximumInterval, easyGradMax), 4);
  }

  // ═══ STATE 1 or 3: Learning / Relearning ═══
  if (card.state === 1 || card.state === 3) {
    const steps = card.state === 3 ? relearningSteps : learningSteps;
    const s = card.stability > 0 ? card.stability : initStability(w, rating);
    const d = card.difficulty > 0 ? nextDifficulty(w, card.difficulty, rating) : initDifficulty(w, rating);

    if (rating === 1) {
      // Again → back to step 0, keep stability (Anki: stability unchanged during learning)
      const stepMinutes = steps[0] ?? 1;
      return scheduleStep(now, stepMinutes, s, d, card.state, 0);
    }
    if (rating === 2) {
      // Hard → repeat current step, interval = avg(steps[N], steps[N+1]) or steps[N]*1.5
      const currentStepMin = steps[currentStep] ?? steps[steps.length - 1] ?? 10;
      const nextStepMin = currentStep + 1 < steps.length ? steps[currentStep + 1] : null;
      const avgMinutes = nextStepMin !== null ? (currentStepMin + nextStepMin) / 2 : currentStepMin * 1.5;
      return scheduleStep(now, avgMinutes, s, d, card.state, currentStep);
    }
    if (rating === 3) {
      // Good → advance to next step, or graduate if last step
      const nextStep = currentStep + 1;
      if (nextStep < steps.length) {
        return scheduleStep(now, steps[nextStep], s, d, card.state, nextStep);
      }
      // Last step → graduate to review
      return graduateToReview(w, s, d, requestedRetention, maximumInterval);
    }
    // Easy → graduate with easy bonus, capped by easyGraduatingInterval
    const easyS = s * w[16];
    return graduateToReview(w, easyS, d, requestedRetention, Math.min(maximumInterval, easyGradMax), 4);
  }

  // ═══ STATE 2: Review ═══
  // Elapsed days = time since last review (preferred) or time since scheduled date (fallback)
  const lastReviewTime = card.last_reviewed_at ? new Date(card.last_reviewed_at).getTime() : null;
  const scheduledTime = new Date(card.scheduled_date).getTime();
  const referenceTime = lastReviewTime ?? scheduledTime;
  const elapsedDays = Math.max(0, (now.getTime() - referenceTime) / (1000 * 60 * 60 * 24));
  const d = nextDifficulty(w, card.difficulty, rating);

  // Same-day review (elapsed < 1 day)
  if (elapsedDays < 1) {
    const s = sameDayStability(w, card.stability, rating);
    if (rating === 1) {
      const sForget = nextForgetStability(w, card.difficulty, card.stability, retrievability(w, card.stability, elapsedDays));
      const stepMinutes = relearningSteps[0] ?? 10;
      return scheduleStep(now, stepMinutes, sForget, d, 3, 0);
    }
    const interval = stabilityToInterval(w, s, requestedRetention, maximumInterval);
    // Floor differentiation matching normal review behavior
    let minInterval = 1;
    if (rating === 3) minInterval = 2;
    if (rating === 4) minInterval = 3;
    const finalInterval = Math.max(interval, minInterval);
    const scheduledDate = getLocalMidnight(finalInterval);
    return { stability: s, difficulty: d, state: 2, scheduled_date: scheduledDate.toISOString(), interval_days: finalInterval, learning_step: 0 };
  }

  const r = retrievability(w, card.stability, elapsedDays);

  if (rating === 1) {
    // Again → relearning step 0
    const s = nextForgetStability(w, card.difficulty, card.stability, r);
    const stepMinutes = relearningSteps[0] ?? 10;
    return scheduleStep(now, stepMinutes, s, d, 3, 0);
  }

  // Hard, Good, Easy → recall
  const s = nextRecallStability(w, card.difficulty, card.stability, r, rating);
  const interval = stabilityToInterval(w, s, requestedRetention, maximumInterval);

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

  const scheduledDate = getLocalMidnight(finalInterval);
  return { stability: s, difficulty: d, state: 2, scheduled_date: scheduledDate.toISOString(), interval_days: finalInterval, learning_step: 0 };
}

// ── Preview intervals ──

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
  if (output.interval_days >= 365) {
    const years = output.interval_days / 365;
    return years >= 10 ? `${Math.round(years)}a` : `${years.toFixed(1).replace(/\.0$/, '')}a`;
  }
  if (output.interval_days >= 30) {
    const months = output.interval_days / 30;
    return months >= 10 ? `${Math.round(months)}m` : `${months.toFixed(1).replace(/\.0$/, '')}m`;
  }
  return `${output.interval_days}d`;
}
