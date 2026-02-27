// SM-2 (SuperMemo 2) Algorithm Implementation
// Classic spaced repetition algorithm used by Anki as default

export type Rating = 1 | 2 | 3 | 4;

export interface SM2Card {
  stability: number;   // used as EFactor (ease factor), min 1.3
  difficulty: number;  // used as repetition count
  state: number;       // 0=new, 1=learning, 2=review, 3=relearning
  scheduled_date: string;
}

export interface SM2Output {
  stability: number;   // new EFactor
  difficulty: number;  // new repetition count
  state: number;
  scheduled_date: string;
  interval_days: number;
}

export interface SM2Params {
  learningSteps: number[];   // minutes
  easyBonus: number;         // e.g. 1.3 (130%)
  intervalModifier: number;  // e.g. 1.0 (100%)
  maxInterval: number;       // days
}

export const DEFAULT_SM2_PARAMS: SM2Params = {
  learningSteps: [1, 10],
  easyBonus: 1.3,
  intervalModifier: 1.0,
  maxInterval: 36500,
};

// Map 4-button rating to SM-2 quality (0-5)
function ratingToQuality(rating: Rating): number {
  switch (rating) {
    case 1: return 1; // Again
    case 2: return 2; // Hard
    case 3: return 3; // Good
    case 4: return 5; // Easy
  }
}

function calculateEFactor(oldEF: number, quality: number): number {
  const newEF = oldEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return Math.max(1.3, newEF);
}

/** Get local midnight N days from now (for day-based intervals). */
function getLocalMidnight(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getLastInterval(card: SM2Card): number {
  // Estimate last interval from scheduled_date
  const scheduled = new Date(card.scheduled_date).getTime();
  const now = Date.now();
  const days = Math.max(1, Math.round((scheduled - (now - 86400000 * 1)) / 86400000));
  return Math.max(1, days);
}

export function sm2Schedule(card: SM2Card, rating: Rating, params: SM2Params = DEFAULT_SM2_PARAMS): SM2Output {
  const now = new Date();
  const { learningSteps, easyBonus, intervalModifier, maxInterval } = params;
  const quality = ratingToQuality(rating);

  // EFactor stored in stability field, repetitions in difficulty field
  let ef = card.stability > 0 ? card.stability : 2.5;
  let reps = Math.round(card.difficulty);

  if (card.state === 0 || card.state === 1 || card.state === 3) {
    // New or Learning card
    if (rating === 1) {
      // Again: stay in learning, reset reps, use first step
      const stepMinutes = learningSteps[0] ?? 1;
      const scheduledDate = new Date(now.getTime() + stepMinutes * 60 * 1000);
      const newEF = card.state === 0 ? 2.5 : calculateEFactor(ef, quality);
      return {
        stability: Math.max(1.3, newEF),
        difficulty: 0,
        state: 1,
        scheduled_date: scheduledDate.toISOString(),
        interval_days: 0,
      };
    }

    if (rating === 2) {
      // Hard in learning: use second step (or first if only one)
      const stepMinutes = learningSteps.length > 1 ? learningSteps[1] : learningSteps[0] ?? 10;
      const scheduledDate = new Date(now.getTime() + stepMinutes * 60 * 1000);
      const newEF = card.state === 0 ? 2.5 : calculateEFactor(ef, quality);
      return {
        stability: Math.max(1.3, newEF),
        difficulty: 0,
        state: 1,
        scheduled_date: scheduledDate.toISOString(),
        interval_days: 0,
      };
    }

    // Good or Easy: graduate to review
    let interval = 1; // first graduation interval
    if (rating === 4) {
      interval = 4; // easy graduation
    }

    interval = Math.round(interval * intervalModifier);
    if (rating === 4) interval = Math.round(interval * easyBonus);
    interval = Math.min(Math.max(interval, 1), maxInterval);

    const newEF = calculateEFactor(ef === 2.5 && card.state === 0 ? 2.5 : ef, quality);
    const scheduledDate = getLocalMidnight(interval);

    return {
      stability: Math.max(1.3, newEF),
      difficulty: 1, // first successful rep
      state: 2,
      scheduled_date: scheduledDate.toISOString(),
      interval_days: interval,
    };
  }

  // Review card (state === 2)
  if (rating === 1) {
    // Lapse (Again): back to relearning (state 3)
    const stepMinutes = learningSteps[0] ?? 1;
    const scheduledDate = new Date(now.getTime() + stepMinutes * 60 * 1000);
    const newEF = calculateEFactor(ef, quality);
    return {
      stability: Math.max(1.3, newEF),
      difficulty: 0, // reset reps
      state: 3,
      scheduled_date: scheduledDate.toISOString(),
      interval_days: 0,
    };
  }

  // Successful review (rating 2=Hard, 3=Good, 4=Easy)
  const newEF = calculateEFactor(ef, quality);
  let interval: number;

  if (reps === 0) {
    interval = 1;
  } else if (reps === 1) {
    interval = 6;
  } else {
    const scheduledTime = new Date(card.scheduled_date).getTime();
    const elapsedDays = Math.max(1, Math.round((now.getTime() - scheduledTime) / 86400000 + (scheduledTime > now.getTime() ? (scheduledTime - now.getTime()) / 86400000 : 0)));
    const prevInterval = Math.max(1, reps === 2 ? 6 : elapsedDays);
    interval = Math.round(prevInterval * newEF);
  }

  interval = Math.round(interval * intervalModifier);
  // Hard: reduce interval by 20% (like Anki's hard multiplier ~1.2 vs EF)
  if (rating === 2) interval = Math.max(1, Math.round(interval * 0.8));
  if (rating === 4) interval = Math.round(interval * easyBonus);
  interval = Math.min(Math.max(interval, 1), maxInterval);

  const scheduledDate = getLocalMidnight(interval);

  return {
    stability: Math.max(1.3, newEF),
    difficulty: reps + 1,
    state: 2,
    scheduled_date: scheduledDate.toISOString(),
    interval_days: interval,
  };
}

// Preview intervals for all ratings (SM-2)
export function sm2PreviewIntervals(card: SM2Card, params: SM2Params = DEFAULT_SM2_PARAMS): Record<Rating, string> {
  const results = {} as Record<Rating, string>;
  for (const rating of [1, 2, 3, 4] as Rating[]) {
    const output = sm2Schedule(card, rating, params);
    results[rating] = formatInterval(output);
  }
  return results;
}

function formatInterval(output: SM2Output): string {
  if (output.interval_days === 0) {
    const diffMs = new Date(output.scheduled_date).getTime() - Date.now();
    const mins = Math.max(1, Math.round(diffMs / (1000 * 60)));
    if (mins < 60) return `${mins}min`;
    return `${Math.round(mins / 60)}h`;
  }
  if (output.interval_days === 1) return '1d';
  return `${output.interval_days}d`;
}
