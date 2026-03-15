/**
 * Card Query operations — Read-only data fetching (CQRS: Query side).
 * Single Responsibility: Only handles reading card data from the database.
 */

import { supabase } from '@/integrations/supabase/client';
import type { CardRow } from '@/types/deck';

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
      .select('*')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
  );
}

/** Lightweight metadata for all cards (for counts/filters). No heavy content fields. */
export type CardMeta = { id: string; state: number | null; card_type: string; scheduled_date: string };

export async function fetchAggregatedCardsMeta(deckIds: string[]): Promise<CardMeta[]> {
  if (deckIds.length === 0) return [];
  if (deckIds.length === 1) {
    return paginatedFetch<CardMeta>((from) =>
      supabase.from('cards').select('id, state, card_type, scheduled_date').eq('deck_id', deckIds[0]).range(from, from + PAGE_SIZE - 1)
    );
  }
  const results: CardMeta[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const rows = await paginatedFetch<CardMeta>((from) =>
      supabase.from('cards').select('id, state, card_type, scheduled_date').in('deck_id', batch).range(from, from + PAGE_SIZE - 1)
    );
    results.push(...rows);
  }
  return results;
}

/** Fetch paginated full cards for display. Uses server-side pagination. */
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
  const results: CardRow[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const needed = offset + limit;
    const { data, error } = await withRetry(async () => {
      const res = await supabase.from('cards').select('*').in('deck_id', batch).order('created_at', { ascending: false }).range(0, needed - 1);
      return res as { data: CardRow[] | null; error: any };
    });
    if (error) throw error;
    if (data) results.push(...(data as CardRow[]));
  }
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return results.slice(offset, offset + limit);
}

/** Fetch aggregated cards (FULL - backward compat). */
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

/** Fetch cloze siblings by front_content. */
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

/** Fetch aggregated stats for multiple decks. */
export async function fetchAggregatedStats(deckIds: string[]) {
  const totals = { new_count: 0, learning_count: 0, review_count: 0, reviewed_today: 0, new_reviewed_today: 0, new_graduated_today: 0 };
  if (deckIds.length === 0) return totals;

  const allCards: { id: string; state: number | null; scheduled_date: string }[] = [];
  for (let i = 0; i < deckIds.length; i += IN_BATCH) {
    const batch = deckIds.slice(i, i + IN_BATCH);
    const rows = await paginatedFetch<{ id: string; state: number | null; scheduled_date: string }>((from) =>
      supabase.from('cards').select('id, state, scheduled_date').in('deck_id', batch).range(from, from + PAGE_SIZE - 1)
    );
    allCards.push(...rows);
  }

  if (allCards.length === 0) return totals;
  const now = new Date();
  for (const c of allCards) {
    if (c.state === 0 || c.state == null) totals.new_count++;
    else if (c.state === 1 || c.state === 3) totals.learning_count++;
    else if (c.state === 2 && new Date(c.scheduled_date) <= now) totals.review_count++;
  }
  return totals;
}
