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
    uniqueDays.add(formatDayKey(d));
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = formatDayKey(today);

  // Start from today if studied, otherwise yesterday
  const startDate = new Date(today);
  if (!uniqueDays.has(todayKey)) {
    startDate.setDate(startDate.getDate() - 1);
  }

  // Phase 1: Walk backwards collecting candidate streak entries.
  // Stop at 2 consecutive gaps (a single freeze can only bridge 1 gap day).
  const entries: { key: string; studied: boolean }[] = [];
  const checkDate = new Date(startDate);
  let consecutiveGaps = 0;

  for (let i = 0; i < 730; i++) {
    const key = formatDayKey(checkDate);
    const studied = uniqueDays.has(key);

    if (studied) {
      consecutiveGaps = 0;
      entries.push({ key, studied: true });
    } else {
      consecutiveGaps++;
      if (consecutiveGaps >= 2) break; // Can't bridge 2+ consecutive gaps
      entries.push({ key, studied: false });
    }

    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Remove trailing gap if last entry is a gap (no reason to freeze before the streak began)
  while (entries.length > 0 && !entries[entries.length - 1].studied) {
    entries.pop();
  }

  // Phase 2: Count studied days & gaps, check freeze budget
  let totalStudied = entries.filter(e => e.studied).length;
  let gapEntries = entries.filter(e => !e.studied);
  let totalFreezes = Math.floor(totalStudied / 7);

  if (totalFreezes >= gapEntries.length) {
    // All gaps covered
    const frozenDays = new Set(gapEntries.map(e => e.key));
    return {
      streak: entries.length,
      freezesAvailable: totalFreezes - gapEntries.length,
      freezesUsed: gapEntries.length,
      frozenDays,
    };
  }

  // Phase 3: Not enough freezes — trim from the oldest end until balanced
  while (
    entries.length > 0 &&
    Math.floor(entries.filter(e => e.studied).length / 7) <
      entries.filter(e => !e.studied).length
  ) {
    entries.pop();
  }
  // Remove trailing gaps after trim
  while (entries.length > 0 && !entries[entries.length - 1].studied) {
    entries.pop();
  }

  totalStudied = entries.filter(e => e.studied).length;
  gapEntries = entries.filter(e => !e.studied);
  totalFreezes = Math.floor(totalStudied / 7);
  const freezesUsed = Math.min(totalFreezes, gapEntries.length);
  const frozenDays = new Set(gapEntries.slice(0, freezesUsed).map(e => e.key));

  return {
    streak: totalStudied + freezesUsed,
    freezesAvailable: totalFreezes - freezesUsed,
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
