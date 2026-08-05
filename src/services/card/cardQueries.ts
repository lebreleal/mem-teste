/**
 * Card Query operations — Read-only data fetching (CQRS: Query side).
 * Single Responsibility: Only handles reading card data from the database.
 */

import { supabase } from '@/integrations/supabase/client';
import type { CardRow } from '@/types/deck';

const CARD_COLS = 'id, deck_id, front_content, back_content, card_type, state, stability, difficulty, scheduled_date, learning_step, last_reviewed_at, origin_deck_id, created_at, updated_at, last_rating' as const;

const CARD_EXPORT_COLS = 'front_content, back_content, card_type' as const;

const PAGE_SIZE = 1000;
const IN_BATCH = 300;

// ─── Infrastructure Helpers (private) ───────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg = err?.message || '';
      if (attempt < maxRetries - 1 && (
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

// ─── Exported Queries ───────────────────────────────────

/** Fetch all cards for a single deck. */
export async function fetchCards(deckId: string) {
  return paginatedFetch((from) =>
    supabase
      .from('cards')
      .select(CARD_COLS)
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
  );
}

/** Lightweight metadata for all cards (for counts/filters). No heavy content fields. */
export type CardMeta = { id: string; state: number | null; card_type: string; scheduled_date: string };



/** Fetch cloze/occlusion siblings by front_content. */
export async function fetchClozeSiblings(deckIds: string[], frontContent: string): Promise<CardRow[]> {
  if (deckIds.length === 0) return [];
  const siblingTypes = ['cloze', 'image_occlusion'];
  if (deckIds.length === 1) {
    const { data, error } = await supabase.from('cards').select(CARD_COLS).eq('deck_id', deckIds[0]).in('card_type', siblingTypes).eq('front_content', frontContent);
    if (error) throw error;
    return (data ?? []) as CardRow[];
  }
  const results: CardRow[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const { data, error } = await supabase.from('cards').select(CARD_COLS).in('deck_id', batch).in('card_type', siblingTypes).eq('front_content', frontContent);
    if (error) throw error;
    if (data) results.push(...(data as CardRow[]));
  }
  return results;
}

// ─── RPC-based Queries ──────────────────────────────────

export interface DescendantCardCounts {
  total: number;
  new_count: number;
  learning_count: number;
  review_count: number;
  basic_count: number;
  cloze_count: number;
  mc_count: number;
  occlusion_count: number;
  frozen_count: number;
  diff_novo: number;
  diff_facil: number;
  diff_bom: number;
  diff_dificil: number;
  diff_errei: number;
}

/** Count cards by state/type for a deck + all descendants (single SQL query). */
export async function fetchDescendantCardCounts(deckId: string): Promise<DescendantCardCounts> {
  const { data, error } = await supabase.rpc('count_descendant_cards_by_state', { p_deck_id: deckId });
  if (error) throw error;
  const row: any = Array.isArray(data) ? data[0] : data;
  return {
    total: Number(row?.total ?? 0),
    new_count: Number(row?.new_count ?? 0),
    learning_count: Number(row?.learning_count ?? 0),
    review_count: Number(row?.review_count ?? 0),
    basic_count: Number(row?.basic_count ?? 0),
    cloze_count: Number(row?.cloze_count ?? 0),
    mc_count: Number(row?.mc_count ?? 0),
    occlusion_count: Number(row?.occlusion_count ?? 0),
    frozen_count: Number(row?.frozen_count ?? 0),
    diff_novo: Number(row?.diff_novo ?? 0),
    diff_facil: Number(row?.diff_facil ?? 0),
    diff_bom: Number(row?.diff_bom ?? 0),
    diff_dificil: Number(row?.diff_dificil ?? 0),
    diff_errei: Number(row?.diff_errei ?? 0),
  };
}

/** Fetch a page of cards from a deck + all descendants (single SQL query). */
export async function fetchDescendantCardsPage(deckId: string, limit: number, offset: number): Promise<CardRow[]> {
  const { data, error } = await supabase.rpc('get_descendant_cards_page', { p_deck_id: deckId, p_limit: limit, p_offset: offset });
  if (error) throw error;
  return (data ?? []) as CardRow[];
}


/**
 * Server-side search across a deck and its descendants (Lei 1G: paginated
 * lists must not be searched client-side — results would be limited to the
 * rows already downloaded).
 */
export async function searchCardsInDecks(deckIds: string[], query: string, limit = 200): Promise<CardRow[]> {
  const term = query.trim();
  if (deckIds.length === 0 || term.length < 2) return [];
  const escaped = term.replace(/[%_,()]/g, ' ').trim();
  if (!escaped) return [];
  const results: CardRow[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const { data, error } = await withRetry(() =>
      supabase
        .from('cards')
        .select(CARD_COLS)
        .in('deck_id', batch)
        .or(`front_content.ilike.%${escaped}%,back_content.ilike.%${escaped}%`)
        .order('created_at', { ascending: false })
        .limit(limit) as unknown as Promise<{ data: CardRow[] | null; error: unknown }>,
    );
    if (error) throw error;
    if (data) results.push(...data);
    if (results.length >= limit) break;
  }
  return results.slice(0, limit);
}


/** Fetch card contents for export (CSV / Anki). */
export async function fetchCardsForExport(deckId: string) {
  const { data, error } = await supabase
    .from('cards')
    .select(CARD_EXPORT_COLS)
    .eq('deck_id', deckId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Count review-state cards due now across multiple deck IDs. */
export async function fetchReviewDueCount(deckIds: string[], nowISO: string): Promise<number> {
  const { count, error } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .in('deck_id', deckIds)
    .eq('state', 2)
    .lte('scheduled_date', nowISO);
  if (error) throw error;
  return count ?? 0;
}

/** Fetch study plan deck_ids for a user. Canonical implementation lives in studyService. */
export { fetchStudyPlanDeckIds } from '@/services/studyService';
