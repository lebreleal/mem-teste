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

/**
 * Find the root ancestor deck ID by traversing parent_deck_id up.
 * If the deck has no parent, returns itself.
 */
export function findRootAncestorId(
  allDecks: { id: string; parent_deck_id: string | null }[],
  deckId: string,
): string {
  let currentId = deckId;
  while (true) {
    const deck = allDecks.find(d => d.id === currentId);
    if (!deck?.parent_deck_id) return currentId;
    currentId = deck.parent_deck_id;
  }
}

/**
 * Get the index of the next card ready to be studied.
 * Priority: learning cards (state 1) with expired timer cut the line.
 * Then new (state 0) and review (state 2) cards in queue order.
 * Returns -1 if all remaining cards are learning with future timers.
 */
export function getNextReadyIndex(queue: { state: number; scheduled_date: string }[]): number {
  const now = Date.now();
  // 1) Learning cards (state 1) with expired timer cut the line
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].state === 1) {
      const scheduledTime = new Date(queue[i].scheduled_date).getTime();
      if (scheduledTime <= now) return i;
    }
  }
  // 2) Next new/review card in order
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].state === 0 || queue[i].state === 2) return i;
  }
  return -1; // All remaining cards are learning and waiting
}

/** Get local midnight N days from now (for day-based intervals). */
export function getLocalMidnight(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
}
