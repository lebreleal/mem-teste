/**
 * Safely parse exam question options from JSONB.
 * Handles: string (double-serialized), array, or null.
 */
export function parseExamOptions(options: unknown): string[] {
  if (!options) return [];
  if (Array.isArray(options)) return options as string[];
  if (typeof options === 'string') {
    try {
      const parsed = JSON.parse(options);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}
