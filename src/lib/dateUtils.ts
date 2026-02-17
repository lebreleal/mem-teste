/**
 * Pure date utility functions.
 * No React or Supabase dependencies.
 */

/** Get Monday of the current week as YYYY-MM-DD. */
export function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0];
}

/** Get today as YYYY-MM-DD. */
export function getToday(): string {
  return new Date().toISOString().split('T')[0];
}
