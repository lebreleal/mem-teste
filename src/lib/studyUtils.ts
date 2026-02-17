/**
 * Pure utility functions for study session logic.
 * No React or Supabase dependencies.
 */

/** Parse a learning step string (e.g. '15m', '1h', '2d') to minutes. */
export function parseStepToMinutes(step: string): number {
  const num = parseFloat(step);
  if (step.endsWith('d')) return num * 1440;
  if (step.endsWith('h')) return num * 60;
  return num; // assume minutes
}

/** Fisher-Yates shuffle (immutable). */
export function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Collect all descendant deck IDs (children, grandchildren, etc.) for a given parent.
 */
export function collectDescendantIds(
  allDecks: { id: string; parent_deck_id: string | null }[],
  parentId: string,
): string[] {
  const result: string[] = [];
  const queue = [parentId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    const children = allDecks.filter(d => d.parent_deck_id === current);
    for (const child of children) {
      result.push(child.id);
      queue.push(child.id);
    }
  }
  return result;
}

/**
 * Collect all deck IDs inside a folder (recursively through sub-folders).
 */
export function collectFolderDeckIds(
  allDecks: { id: string; folder_id: string | null; parent_deck_id: string | null }[],
  allFolders: { id: string; parent_id: string | null }[],
  folderId: string,
): string[] {
  const directDecks = allDecks
    .filter(d => d.folder_id === folderId && !d.parent_deck_id)
    .map(d => d.id);
  const subFolders = allFolders.filter(f => f.parent_id === folderId);
  const subDeckIds = subFolders.flatMap(f =>
    collectFolderDeckIds(allDecks, allFolders, f.id),
  );
  return [...directDecks, ...subDeckIds];
}
