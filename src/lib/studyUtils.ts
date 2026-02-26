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
  // 1) Learning/relearning cards (state 1 or 3) with expired timer cut the line
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].state === 1 || queue[i].state === 3) {
      const scheduledTime = new Date(queue[i].scheduled_date).getTime();
      if (scheduledTime <= now) return i;
    }
  }
  // 2) Next new/review card in order
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].state === 0 || queue[i].state === 2) return i;
  }
  return -1; // All remaining cards are learning/relearning and waiting
}

/** Get local midnight N days from now (for day-based intervals). */
export function getLocalMidnight(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Decide whether a card should stay in the local session queue after a review.
 * Returns true only when `interval_days === 0` (learning/relearning short-term step).
 * Cards scheduled for a future day (interval_days > 0) are always removed,
 * regardless of the rating (even "Hard").
 */
export function shouldKeepInSession(result: { interval_days: number }): boolean {
  return result.interval_days === 0;
}

/**
 * Apply a review result to the local queue:
 * - If shouldKeep: update the card in-place and move it to the end.
 * - Otherwise: remove it from the queue.
 * Pure function — returns the new queue.
 */
export function applyReviewToQueue<T extends { id: string }>(
  queue: T[],
  cardId: string,
  result: { interval_days: number; state: number; stability: number; difficulty: number; scheduled_date: string; learning_step?: number },
): T[] {
  const keep = shouldKeepInSession(result);
  if (!keep) {
    return queue.filter(c => c.id !== cardId);
  }
  const idx = queue.findIndex(c => c.id === cardId);
  if (idx < 0) return queue;
  const updatedCard = {
    ...queue[idx],
    state: result.state,
    stability: result.stability,
    difficulty: result.difficulty,
    scheduled_date: result.scheduled_date,
    learning_step: result.learning_step ?? 0,
  };
  const without = [...queue.slice(0, idx), ...queue.slice(idx + 1)];
  return [...without, updatedCard];
}

// ─── Shared new-card allocation logic ───

export interface AllocationPlan {
  id: string;
  deck_ids: string[];
  target_date: string | null;
  priority: number;
}

export interface AllocationParams {
  globalBudget: number;
  plans: AllocationPlan[];
  newPerRoot: Record<string, number>;
  findRoot: (id: string) => string;
}

export interface AllocationResult {
  perDeck: Record<string, number>;
  perPlan: Record<string, number>;
}

/**
 * Compute proportional new-card allocation across plans and decks.
 * Pure function — no Supabase dependency.
 *
 * - Aggregates deck IDs to root ancestors
 * - Weights by urgency (remaining / daysLeft)
 * - Distributes globalBudget with 5% minimum floor per root
 * - Deduplicates roots shared between plans (first/highest-priority wins)
 */
export function computeNewCardAllocation(params: AllocationParams): AllocationResult {
  const { globalBudget, plans, newPerRoot, findRoot } = params;
  const perDeck: Record<string, number> = {};
  const perPlan: Record<string, number> = {};

  const sortedPlans = [...plans].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

  // Build weights per root (deduplicated across all plans)
  const weights: { rootId: string; weight: number }[] = [];
  const seenRoots = new Set<string>();

  for (const p of sortedPlans) {
    const daysLeft = p.target_date
      ? Math.max(1, Math.ceil((new Date(p.target_date).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000))
      : 90;
    for (const did of (p.deck_ids ?? [])) {
      const rootId = findRoot(did);
      if (seenRoots.has(rootId)) continue;
      seenRoots.add(rootId);
      const remaining = newPerRoot[rootId] ?? 0;
      if (remaining === 0) { perDeck[rootId] = 0; continue; }
      weights.push({ rootId, weight: remaining / daysLeft });
    }
  }

  const totalWeight = weights.reduce((s, w) => s + w.weight, 0);

  if (globalBudget <= 0) {
    // Zero budget day — all roots get 0
    for (const { rootId } of weights) perDeck[rootId] = 0;
  } else if (totalWeight > 0) {
    const minShare = Math.max(1, Math.ceil(globalBudget * 0.05));
    const sorted = [...weights].sort((a, b) => b.weight - a.weight);

    // First pass: raw shares with minimum floor
    let totalAllocated = 0;
    for (const { rootId, weight } of sorted) {
      const rawShare = Math.max(1, Math.round(globalBudget * (weight / totalWeight)));
      const floored = Math.max(minShare, rawShare);
      const cappedToNew = Math.min(floored, newPerRoot[rootId] ?? 0);
      perDeck[rootId] = cappedToNew;
      totalAllocated += cappedToNew;
    }

    // Second pass: trim excess from largest
    if (totalAllocated > globalBudget) {
      let excess = totalAllocated - globalBudget;
      for (const { rootId } of sorted) {
        if (excess <= 0) break;
        const current = perDeck[rootId];
        const canTrim = Math.max(0, current - minShare);
        const trim = Math.min(canTrim, excess);
        perDeck[rootId] = current - trim;
        excess -= trim;
      }
    }
  }

  // Aggregate per-plan: each root claimed by first (highest-priority) plan only
  const globalClaimedRoots = new Set<string>();
  for (const p of sortedPlans) {
    const planRoots = new Set<string>();
    let sum = 0;
    for (const id of (p.deck_ids ?? [])) {
      const rootId = findRoot(id);
      if (planRoots.has(rootId)) continue;
      planRoots.add(rootId);
      if (!globalClaimedRoots.has(rootId)) {
        globalClaimedRoots.add(rootId);
        sum += perDeck[rootId] ?? 0;
      }
    }
    perPlan[p.id] = sum;
  }

  return { perDeck, perPlan };
}
