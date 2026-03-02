/**
 * Service layer for individual card CRUD operations.
 */

import { supabase } from '@/integrations/supabase/client';
import { markdownToHtml } from '@/lib/markdownToHtml';
import { compressImage } from '@/lib/imageUtils';
import type { CardRow } from '@/types/deck';
export type { CardRow } from '@/types/deck';

const PAGE_SIZE = 1000;
const MAX_RETRIES = 3;

/** Helper: execute a fn with retry on network errors */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = err?.message || '';
      if (attempt < MAX_RETRIES - 1 && (
        msg.includes('Failed to fetch') ||
        msg.includes('ERR_') ||
        msg.includes('NetworkError') ||
        msg.includes('PGRST000')
      )) {
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries exceeded');
}

/** Paginated fetch helper with retry */
async function paginatedFetch<T>(
  buildQuery: (from: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await withRetry(() => buildQuery(from) as Promise<{ data: T[] | null; error: any }>);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

/** Batch `.in()` queries to avoid URL length limits */
const IN_BATCH = 300;
async function batchedInFetch<T>(
  ids: string[],
  buildQuery: (batchIds: string[], from: number) => PromiseLike<{ data: T[] | null; error: any }>,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < ids.length; i += IN_BATCH) {
    const batch = ids.slice(i, i + IN_BATCH);
    const rows = await paginatedFetch<T>((from) => buildQuery(batch, from));
    results.push(...rows);
  }
  return results;
}

/** Fetch all cards for a deck. */
export async function fetchCards(deckId: string) {
  return paginatedFetch((from) =>
    supabase
      .from('cards')
      .select('*')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
  );
}

/** Create a single card. */
export async function createCard(deckId: string, input: { frontContent: string; backContent: string; cardType?: string }) {
  const { data, error } = await supabase
    .from('cards')
    .insert({ deck_id: deckId, front_content: input.frontContent, back_content: input.backContent, card_type: input.cardType ?? 'basic' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Create multiple cards at once (batch insert). Splits into batches of 200 to avoid payload limits. */
export async function createCards(deckId: string, cards: { frontContent: string; backContent: string; cardType: string }[]) {
  // Use incrementing created_at timestamps so insertion order is preserved
  // This ensures that when shuffle is disabled, cards appear in the original order
  const baseTime = Date.now();
  const rows = cards.map((c, idx) => ({
    deck_id: deckId,
    front_content: c.frontContent,
    back_content: c.backContent,
    card_type: c.cardType,
    state: 0,
    stability: 0,
    difficulty: 0,
    created_at: new Date(baseTime + idx).toISOString(),
  }));
  const BATCH_SIZE = 200;
  const allData: any[] = [];
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from('cards').insert(batch).select();
    if (error) throw error;
    if (data) allData.push(...data);
  }
  return allData;
}

/** Update a card's content. */
export async function updateCard(id: string, frontContent: string, backContent: string) {
  const { data, error } = await supabase
    .from('cards')
    .update({ front_content: frontContent, back_content: backContent })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Delete a card. */
export async function deleteCard(id: string) {
  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) throw error;
}

/** Move a card to a different deck. */
export async function moveCard(id: string, targetDeckId: string) {
  const { error } = await supabase.from('cards').update({ deck_id: targetDeckId } as any).eq('id', id);
  if (error) throw error;
}

/** Bulk move cards to a different deck. */
export async function bulkMoveCards(ids: string[], targetDeckId: string) {
  const { error } = await supabase.from('cards').update({ deck_id: targetDeckId } as any).in('id', ids);
  if (error) throw error;
}

/** Bulk delete cards. */
export async function bulkDeleteCards(ids: string[]) {
  const { error } = await supabase.from('cards').delete().in('id', ids);
  if (error) throw error;
}

/** Upload a card image to storage. Returns the public URL. */
export async function uploadCardImage(userId: string, file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Máximo 5MB');
  const compressed = await compressImage(file);
  const ext = compressed.name.split('.').pop() || 'webp';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('card-images').upload(path, compressed);
  if (error) throw error;
  const { data: urlData } = supabase.storage.from('card-images').getPublicUrl(path);
  return urlData.publicUrl;
}

/** Enhance a card using AI. */
export async function enhanceCard(params: {
  front: string;
  back: string;
  cardType: string;
  aiModel: string;
  energyCost: number;
}) {
  const { data, error } = await supabase.functions.invoke('enhance-card', { body: params });
  if (error) throw error;

  // Convert markdown formatting from AI response to HTML
  if (data?.front) data.front = markdownToHtml(data.front);
  if (data?.back && typeof data.back === 'string') data.back = markdownToHtml(data.back);

  return data;
}

/** Lightweight metadata for all cards (for counts/filters). */
export type CardMeta = { id: string; state: number | null; card_type: string; scheduled_date: string; front_content: string };

export async function fetchAggregatedCardsMeta(deckIds: string[]): Promise<CardMeta[]> {
  if (deckIds.length === 0) return [];
  if (deckIds.length === 1) {
    return paginatedFetch<CardMeta>((from) =>
      supabase.from('cards').select('id, state, card_type, scheduled_date, front_content').eq('deck_id', deckIds[0]).range(from, from + PAGE_SIZE - 1)
    );
  }
  const results: CardMeta[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const rows = await paginatedFetch<CardMeta>((from) =>
      supabase.from('cards').select('id, state, card_type, scheduled_date, front_content').in('deck_id', batch).range(from, from + PAGE_SIZE - 1)
    );
    results.push(...rows);
  }
  return results;
}

/** Fetch paginated full cards for display. */
export async function fetchAggregatedCardsPage(deckIds: string[], limit: number, offset: number) {
  if (deckIds.length === 0) return [];
  if (deckIds.length === 1) {
    const { data, error } = await withRetry(async () => {
      const res = await supabase.from('cards').select('*').eq('deck_id', deckIds[0]).order('created_at', { ascending: false }).range(offset, offset + limit - 1);
      return res as { data: CardRow[] | null; error: any };
    });
    if (error) throw error;
    return (data ?? []) as CardRow[];
  }
  // For multiple deck IDs, fetch in batches and manually paginate
  const results: CardRow[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const rows = await paginatedFetch<CardRow>((from) =>
      supabase.from('cards').select('*').in('deck_id', batch).order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
    );
    results.push(...rows);
  }
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return results.slice(offset, offset + limit);
}

/** Fetch aggregated cards for a deck and all descendants (FULL - kept for backward compat). */
export async function fetchAggregatedCards(deckIds: string[]) {
  if (deckIds.length === 0) return [];
  if (deckIds.length === 1) {
    return paginatedFetch((from) =>
      supabase.from('cards').select('*').eq('deck_id', deckIds[0]).order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
    );
  }
  const results: any[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const rows = await paginatedFetch((from) =>
      supabase.from('cards').select('*').in('deck_id', batch).order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1)
    );
    results.push(...rows);
  }
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return results;
}

/** Fetch cloze siblings by front_content (for edit/delete). */
export async function fetchClozeSiblings(deckIds: string[], frontContent: string): Promise<CardRow[]> {
  if (deckIds.length === 0) return [];
  if (deckIds.length === 1) {
    const { data, error } = await supabase.from('cards').select('*').eq('deck_id', deckIds[0]).eq('card_type', 'cloze').eq('front_content', frontContent);
    if (error) throw error;
    return (data ?? []) as CardRow[];
  }
  const results: CardRow[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const { data, error } = await supabase.from('cards').select('*').in('deck_id', batch).eq('card_type', 'cloze').eq('front_content', frontContent);
    if (error) throw error;
    if (data) results.push(...(data as CardRow[]));
  }
  return results;
}

/** Fetch aggregated stats for multiple decks in a single efficient query. */
export async function fetchAggregatedStats(deckIds: string[]) {
  const totals = { new_count: 0, learning_count: 0, review_count: 0, reviewed_today: 0, new_reviewed_today: 0, new_graduated_today: 0 };
  if (deckIds.length === 0) return totals;

  const allCards: { id: string; state: number | null; scheduled_date: string }[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const rows = await paginatedFetch<{ id: string; state: number | null; scheduled_date: string }>((from) =>
      supabase
        .from('cards')
        .select('id, state, scheduled_date')
        .in('deck_id', batch)
        .range(from, from + PAGE_SIZE - 1)
    );
    allCards.push(...rows);
  }

  if (allCards.length === 0) return totals;

  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  for (const c of allCards) {
    if (c.state === 0 || c.state == null) totals.new_count++;
    else if (c.state === 1 || c.state === 3) totals.learning_count++;
    else if (c.state === 2 && new Date(c.scheduled_date) <= now) totals.review_count++;
  }

  const cardIds = allCards.map(c => c.id);
  const todayLogs = await batchedInFetch<{ card_id: string }>(cardIds, (batch, from) =>
    supabase
      .from('review_logs')
      .select('card_id')
      .in('card_id', batch)
      .gte('reviewed_at', todayStart.toISOString())
      .range(from, from + PAGE_SIZE - 1)
  );

  if (todayLogs.length === 0) return totals;

  const reviewedCardIds = new Set(todayLogs.map(l => l.card_id));
  const reviewedIds = [...reviewedCardIds];

  const priorLogs = await batchedInFetch<{ card_id: string }>(reviewedIds, (batch, from) =>
    supabase
      .from('review_logs')
      .select('card_id')
      .in('card_id', batch)
      .lt('reviewed_at', todayStart.toISOString())
      .range(from, from + PAGE_SIZE - 1)
  );

  const hadPriorReview = new Set(priorLogs.map(l => l.card_id));

  for (const cardId of reviewedCardIds) {
    const card = allCards.find(c => c.id === cardId);
    if (!card) continue;

    if (!hadPriorReview.has(cardId)) {
      totals.new_reviewed_today++;
      if (card.state === 2) totals.new_graduated_today++;
    } else if (card.state === 2 && new Date(card.scheduled_date) > now) {
      totals.reviewed_today++;
    }
  }

  return totals;
}
