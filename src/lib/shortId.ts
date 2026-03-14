/**
 * Generates a short, human-readable display ID from a UUID.
 * Format: 2 uppercase letters + 5 digits (e.g., "AK38271")
 * Deterministic: same UUID always produces the same short ID.
 * Supports 676 letter combos × 100k numbers = ~67M unique IDs.
 */
export function shortDisplayId(uuid: string): string {
  const hex = uuid.replace(/-/g, '');
  const a = parseInt(hex.slice(0, 2), 16) % 26;
  const b = parseInt(hex.slice(2, 4), 16) % 26;
  const num = parseInt(hex.slice(4, 9), 16) % 100000;
  return String.fromCharCode(65 + a) + String.fromCharCode(65 + b) + num.toString().padStart(5, '0');
}
