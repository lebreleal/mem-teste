/**
 * Pure streak calculation utility.
 * No React or Supabase dependencies.
 */

/** Calculate study streak from a list of review timestamps, with freeze support. */
export function calculateStreakWithFreezes(reviewDates: string[]): {
  streak: number;
  freezesAvailable: number;
  freezesUsed: number;
  frozenDays: Set<string>;
} {
  if (reviewDates.length === 0) return { streak: 0, freezesAvailable: 0, freezesUsed: 0, frozenDays: new Set() };

  const uniqueDays = new Set<string>();
  reviewDates.forEach(dateStr => {
    const d = new Date(dateStr);
    uniqueDays.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = formatDayKey(today);

  // Walk backwards from today (or yesterday if today not studied yet)
  const checkDate = new Date(today);
  if (!uniqueDays.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // First pass: count raw consecutive days to determine freeze budget
  // Every 7 consecutive studied days earns 1 freeze
  let streak = 0;
  let freezesUsed = 0;
  let freezesAvailable = 0;
  const frozenDays = new Set<string>();
  let consecutiveStudied = 0;

  while (true) {
    const key = formatDayKey(checkDate);
    if (uniqueDays.has(key)) {
      streak++;
      consecutiveStudied++;
      // Every 7 studied days earns a freeze
      if (consecutiveStudied > 0 && consecutiveStudied % 7 === 0) {
        freezesAvailable++;
      }
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      // Can we use a freeze?
      if (freezesAvailable > freezesUsed) {
        freezesUsed++;
        frozenDays.add(key);
        streak++; // frozen day counts toward streak
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  return {
    streak,
    freezesAvailable: freezesAvailable - freezesUsed,
    freezesUsed,
    frozenDays,
  };
}

/** Simple streak without freezes (backward compat). */
export function calculateStreak(reviewDates: string[]): number {
  return calculateStreakWithFreezes(reviewDates).streak;
}

function formatDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Determine mascot state based on days since last study. */
export function getMascotState(lastStudyDate: Date | null): 'happy' | 'tired' | 'sleeping' {
  if (!lastStudyDate) return 'sleeping';
  const daysSince = Math.floor((Date.now() - lastStudyDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince <= 2) return 'happy';
  if (daysSince <= 5) return 'tired';
  return 'sleeping';
}
