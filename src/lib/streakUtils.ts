/**
 * Pure streak calculation utility.
 * No React or Supabase dependencies.
 */

/** Calculate study streak from a list of review timestamps. */
export function calculateStreak(reviewDates: string[]): number {
  if (reviewDates.length === 0) return 0;

  const uniqueDays = new Set<string>();
  reviewDates.forEach(dateStr => {
    const d = new Date(dateStr);
    uniqueDays.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const checkDate = new Date(today);
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;

  if (!uniqueDays.has(todayKey)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  let streak = 0;
  while (true) {
    const key = `${checkDate.getFullYear()}-${checkDate.getMonth()}-${checkDate.getDate()}`;
    if (uniqueDays.has(key)) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/** Determine mascot state based on days since last study. */
export function getMascotState(lastStudyDate: Date | null): 'happy' | 'tired' | 'sleeping' {
  if (!lastStudyDate) return 'sleeping';
  const daysSince = Math.floor((Date.now() - lastStudyDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSince <= 2) return 'happy';
  if (daysSince <= 5) return 'tired';
  return 'sleeping';
}
