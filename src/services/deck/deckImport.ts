/**
 * Deck import operations with retry/batching.
 * Extracted from deckService.ts for SRP compliance.
 */

import { supabase } from '@/integrations/supabase/client';

/** Card with optional progress data for import. */
export interface CardImportInput {
  frontContent: string;
  backContent: string;
  cardType: string;
  progress?: {
    state: number;
    stability: number;
    difficulty: number;
    scheduledDate: string;
    learningStep: number;
    lastReviewedAt?: string;
  };
}

/** Revlog entry referencing card by index. */
export interface RevlogImportEntry {
  cardIndex: number;
  rating: number;
  reviewedAt: string;
  stability: number;
  difficulty: number;
  scheduledDate: string;
  state: number | null;
  elapsedMs: number | null;
}

/** Progress callback type for import operations. */
export type ImportProgressCallback = (current: number, total: number) => void;

/** Helper to batch-insert revlog entries. Uses parallel inserts. */
async function insertRevlogBatch(
  userId: string,
  revlog: RevlogImportEntry[],
  cardIdMap: Map<number, string>,
) {
  const BATCH = 500;
  const CONCURRENT = 5;
  const rows = revlog
    .filter(r => cardIdMap.has(r.cardIndex))
    .map(r => ({
      card_id: cardIdMap.get(r.cardIndex)!,
      user_id: userId,
      rating: r.rating,
      reviewed_at: r.reviewedAt,
      stability: r.stability,
      difficulty: r.difficulty,
      scheduled_date: r.scheduledDate,
      state: r.state,
      elapsed_ms: r.elapsedMs,
    }));
  const batches: typeof rows[] = [];
  for (let i = 0; i < rows.length; i += BATCH) {
    batches.push(rows.slice(i, i + BATCH));
  }
  for (let i = 0; i < batches.length; i += CONCURRENT) {
    const group = batches.slice(i, i + CONCURRENT);
    const results = await Promise.all(
      group.map(batch => supabase.from('review_logs').insert(batch as any))
    );
    for (const { error } of results) {
      if (error) console.warn('Revlog insert error (continuing):', error.message);
    }
  }
}

/** Retry helper with exponential backoff for import batches. */
async function importRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = err?.message || '';
      const isRetryable = msg.includes('Failed to fetch') || msg.includes('ERR_') ||
        msg.includes('NetworkError') || msg.includes('PGRST000') ||
        msg.includes('timeout') || msg.includes('AbortError') ||
        (err?.code && String(err.code).startsWith('5'));
      if (attempt < maxRetries - 1 && isRetryable) {
        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

/** Estimate avg card size to determine adaptive batch size. */
function getAdaptiveBatchSize(cards: CardImportInput[], defaultSize = 500): number {
  if (cards.length === 0) return defaultSize;
  const sample = cards.slice(0, Math.min(50, cards.length));
  const avgSize = sample.reduce((sum, c) => sum + (c.frontContent?.length || 0) + (c.backContent?.length || 0), 0) / sample.length;
  if (avgSize > 10000) return 50;
  if (avgSize > 5000) return 100;
  if (avgSize > 2000) return 200;
  return defaultSize;
}

/** Import a deck with cards and optional progress/revlog. Returns the new deck. */
export async function importDeck(
  userId: string,
  name: string,
  folderId: string | null,
  cards: CardImportInput[],
  algorithmMode?: string,
  revlog?: RevlogImportEntry[],
  onProgress?: ImportProgressCallback,
) {
  const { data: newDeck, error: deckErr } = await supabase
    .from('decks')
    .insert({ name, user_id: userId, folder_id: folderId, ...(algorithmMode ? { algorithm_mode: algorithmMode } : {}) } as any)
    .select()
    .single();
  if (deckErr || !newDeck) throw deckErr;
  
  const rows = cards.map(c => ({
    deck_id: (newDeck as any).id,
    front_content: c.frontContent,
    back_content: c.backContent,
    card_type: c.cardType,
    state: c.progress?.state ?? 0,
    stability: c.progress?.stability ?? 0,
    difficulty: c.progress?.difficulty ?? 0,
    scheduled_date: c.progress?.scheduledDate ?? new Date().toISOString(),
    learning_step: c.progress?.learningStep ?? 0,
    ...(c.progress?.lastReviewedAt ? { last_reviewed_at: c.progress.lastReviewedAt } : {}),
  }));

  const BATCH_SIZE = getAdaptiveBatchSize(cards);
  const cardIdMap = new Map<number, string>();
  let insertedCount = 0;
  const totalCards = cards.length;
  const failedBatches: { batch: typeof rows; startIdx: number }[] = [];

  const CONCURRENT = 3;
  const cardBatches: { batch: typeof rows; startIdx: number }[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    cardBatches.push({ batch: rows.slice(i, i + BATCH_SIZE), startIdx: i });
  }

  for (let i = 0; i < cardBatches.length; i += CONCURRENT) {
    const group = cardBatches.slice(i, i + CONCURRENT);
    const results = await Promise.allSettled(
      group.map(g => importRetry(async () => await supabase.from('cards').insert(g.batch as any).select('id')))
    );
    for (let g = 0; g < results.length; g++) {
      const result = results[g];
      if (result.status === 'fulfilled') {
        const { data: inserted, error: cardsErr } = result.value;
        if (cardsErr) {
          console.warn('Card batch insert error (continuing):', cardsErr.message);
          failedBatches.push(group[g]);
        } else if (inserted) {
          const startIdx = group[g].startIdx;
          for (let j = 0; j < inserted.length; j++) {
            cardIdMap.set(startIdx + j, inserted[j].id);
          }
          insertedCount += inserted.length;
        }
      } else {
        console.warn('Card batch failed after retries (continuing):', result.reason?.message);
        failedBatches.push(group[g]);
      }
    }
    onProgress?.(insertedCount, totalCards);
  }

  // Retry failed batches with smaller size
  if (failedBatches.length > 0) {
    for (const fb of failedBatches) {
      const smallBatch = 50;
      for (let i = 0; i < fb.batch.length; i += smallBatch) {
        const chunk = fb.batch.slice(i, i + smallBatch);
        const chunkStartIdx = fb.startIdx + i;
        try {
          const { data: inserted, error } = await importRetry(async () =>
            await supabase.from('cards').insert(chunk as any).select('id')
          );
          if (!error && inserted) {
            for (let j = 0; j < inserted.length; j++) {
              cardIdMap.set(chunkStartIdx + j, inserted[j].id);
            }
            insertedCount += inserted.length;
            onProgress?.(insertedCount, totalCards);
          }
        } catch (retryErr: any) {
          console.warn('Retry also failed for chunk:', retryErr?.message);
        }
      }
    }
  }

  if (revlog && revlog.length > 0 && cardIdMap.size > 0) {
    await insertRevlogBatch(userId, revlog, cardIdMap);
  }
  
  return { deck: newDeck, insertedCount, totalCards };
}

/** Recursive subdeck type for N-level hierarchy */
interface SubdeckNode {
  name: string;
  card_indices: number[];
  children?: SubdeckNode[];
}

/** Import a deck organized into subdecks. Supports recursive hierarchy. */
export async function importDeckWithSubdecks(
  userId: string,
  parentName: string,
  folderId: string | null,
  cards: CardImportInput[],
  subdecks: SubdeckNode[],
  algorithmMode?: string,
  revlog?: RevlogImportEntry[],
  onProgress?: ImportProgressCallback,
) {
  const globalCardIdMap = new Map<number, string>();

  // 1. Create the root parent deck
  const { data: parentDeck, error: parentErr } = await supabase
    .from('decks')
    .insert({
      name: parentName, user_id: userId, folder_id: folderId,
      ...(algorithmMode ? { algorithm_mode: algorithmMode } : {}),
    } as any).select().single();
  if (parentErr || !parentDeck) throw parentErr;
  const parentId = (parentDeck as any).id;

  // 2. BFS: process the tree level-by-level
  type QueueItem = { node: SubdeckNode; resolvedParentId: string | null };
  let queue: QueueItem[] = subdecks.map(sd => ({
    node: sd,
    resolvedParentId: (sd as any).standalone ? null : parentId,
  }));

  const deckCards: { deckId: string; indices: number[] }[] = [];
  const DECK_BATCH = 200;

  while (queue.length > 0) {
    const nextQueue: QueueItem[] = [];

    for (let i = 0; i < queue.length; i += DECK_BATCH) {
      const batch = queue.slice(i, i + DECK_BATCH);
      const rows = batch.map(item => ({
        name: item.node.name,
        user_id: userId,
        folder_id: folderId,
        parent_deck_id: item.resolvedParentId,
        ...(algorithmMode ? { algorithm_mode: algorithmMode } : {}),
      }));

      const { data: inserted, error } = await supabase
        .from('decks').insert(rows as any).select('id');
      if (error) throw error;

      if (inserted) {
        for (let j = 0; j < inserted.length; j++) {
          const deckId = (inserted[j] as any).id;
          const node = batch[j].node;

          if (node.card_indices.length > 0) {
            deckCards.push({ deckId, indices: node.card_indices });
          }

          if (node.children?.length) {
            for (const child of node.children) {
              nextQueue.push({ node: child, resolvedParentId: deckId });
            }
          }
        }
      }
    }

    queue = nextQueue;
  }

  // 3. Bulk-insert all cards
  const CARD_BATCH = getAdaptiveBatchSize(cards);
  const CONCURRENT = 3;
  let insertedCount = 0;
  const totalCards = cards.length;
  const failedJobs: { rows: any[]; originalIndices: number[] }[] = [];

  const allCardJobs: { deckId: string; rows: any[]; originalIndices: number[] }[] = [];
  for (const { deckId, indices } of deckCards) {
    const validIndices = indices.filter(idx => idx >= 0 && idx < cards.length);
    if (validIndices.length === 0) continue;

    const rows = validIndices.map(idx => ({
      deck_id: deckId,
      front_content: cards[idx].frontContent,
      back_content: cards[idx].backContent,
      card_type: cards[idx].cardType,
      state: cards[idx].progress?.state ?? 0,
      stability: cards[idx].progress?.stability ?? 0,
      difficulty: cards[idx].progress?.difficulty ?? 0,
      scheduled_date: cards[idx].progress?.scheduledDate ?? new Date().toISOString(),
      learning_step: cards[idx].progress?.learningStep ?? 0,
      ...(cards[idx].progress?.lastReviewedAt ? { last_reviewed_at: cards[idx].progress.lastReviewedAt } : {}),
    }));

    for (let i = 0; i < rows.length; i += CARD_BATCH) {
      allCardJobs.push({
        deckId,
        rows: rows.slice(i, i + CARD_BATCH),
        originalIndices: validIndices.slice(i, i + CARD_BATCH),
      });
    }
  }

  for (let i = 0; i < allCardJobs.length; i += CONCURRENT) {
    const group = allCardJobs.slice(i, i + CONCURRENT);
    const results = await Promise.allSettled(
      group.map(job => importRetry(async () => await supabase.from('cards').insert(job.rows as any).select('id')))
    );
    for (let g = 0; g < results.length; g++) {
      const result = results[g];
      if (result.status === 'fulfilled') {
        const { data: inserted, error } = result.value;
        if (error) {
          failedJobs.push(group[g]);
        } else if (inserted) {
          const job = group[g];
          for (let j = 0; j < inserted.length; j++) {
            globalCardIdMap.set(job.originalIndices[j], (inserted[j] as any).id);
          }
          insertedCount += inserted.length;
        }
      } else {
        failedJobs.push(group[g]);
      }
    }
    onProgress?.(insertedCount, totalCards);
  }

  // Retry failed jobs
  if (failedJobs.length > 0) {
    for (const fj of failedJobs) {
      const smallBatch = 50;
      for (let i = 0; i < fj.rows.length; i += smallBatch) {
        const chunk = fj.rows.slice(i, i + smallBatch);
        const chunkIndices = fj.originalIndices.slice(i, i + smallBatch);
        try {
          const { data: inserted, error } = await importRetry(async () =>
            await supabase.from('cards').insert(chunk as any).select('id')
          );
          if (!error && inserted) {
            for (let j = 0; j < inserted.length; j++) {
              globalCardIdMap.set(chunkIndices[j], (inserted[j] as any).id);
            }
            insertedCount += inserted.length;
            onProgress?.(insertedCount, totalCards);
          }
        } catch (retryErr: any) {
          console.warn('Retry also failed:', retryErr?.message);
        }
      }
    }
  }

  // 4. Insert revlog
  if (revlog && revlog.length > 0 && globalCardIdMap.size > 0) {
    await insertRevlogBatch(userId, revlog, globalCardIdMap);
  }

  return { deck: parentDeck, insertedCount, totalCards };
}
