/**
 * Pure date utility functions.
 * No React or Supabase dependencies.
 */

/**
 * Fixed timezone offset for São Paulo (UTC-3) in minutes.
 * Used in all RPC calls that accept p_tz_offset_minutes to ensure
 * consistent day boundaries regardless of the user's device timezone.
 */
export const TZ_OFFSET_SP = -180;

/** Get current date/time adjusted to São Paulo timezone (UTC-3). */
function nowInSP(): Date {
  // Date.now() is always UTC epoch ms regardless of browser timezone.
  // Subtract 3h to get SP local time represented as a fake UTC Date.
  return new Date(Date.now() + TZ_OFFSET_SP * 60000);
}

/** Get today as YYYY-MM-DD in São Paulo timezone. */
export function getToday(): string {
  const sp = nowInSP();
  return sp.toISOString().split('T')[0];
}

/** Get Monday of the current week as YYYY-MM-DD in São Paulo timezone. */
export function getWeekStart(): string {
  const sp = nowInSP();
  const day = sp.getDay();
  const diff = sp.getDate() - day + (day === 0 ? -6 : 1);
  sp.setDate(diff);
  return sp.toISOString().split('T')[0];
}
