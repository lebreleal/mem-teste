/**
 * Service layer for individual card CRUD operations.
 */

import { supabase } from '@/integrations/supabase/client';
import { markdownToHtml } from '@/lib/markdownToHtml';
import { compressImage } from '@/lib/imageUtils';
import type { CardRow } from '@/types/deck';
export type { CardRow } from '@/types/deck';

const PAGE_SIZE = 1000;

/** Fetch all cards for a deck. */
export async function fetchCards(deckId: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .eq('deck_id', deckId)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
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

/** Fetch aggregated cards for a deck and all descendants. */
export async function fetchAggregatedCards(deckIds: string[]) {
  if (deckIds.length === 0) return [];

  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('cards')
      .select('*')
      .in('deck_id', deckIds)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return rows;
}

/** Fetch aggregated stats for multiple decks in a single efficient query. */
export async function fetchAggregatedStats(deckIds: string[]) {
  const totals = { new_count: 0, learning_count: 0, review_count: 0, reviewed_today: 0, new_reviewed_today: 0, new_graduated_today: 0 };
  if (deckIds.length === 0) return totals;

  const allCards: Array<{ id: string; state: number | null; scheduled_date: string }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('cards')
      .select('id, state, scheduled_date')
      .in('deck_id', deckIds)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<{ id: string; state: number | null; scheduled_date: string }>;
    allCards.push(...batch);
    if (batch.length < PAGE_SIZE) break;
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
  const todayLogs: Array<{ card_id: string }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('review_logs')
      .select('card_id')
      .in('card_id', cardIds)
      .gte('reviewed_at', todayStart.toISOString())
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<{ card_id: string }>;
    todayLogs.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  if (todayLogs.length === 0) return totals;

  const reviewedCardIds = new Set(todayLogs.map(l => l.card_id));
  const reviewedIds = [...reviewedCardIds];

  const priorLogs: Array<{ card_id: string }> = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('review_logs')
      .select('card_id')
      .in('card_id', reviewedIds)
      .lt('reviewed_at', todayStart.toISOString())
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as Array<{ card_id: string }>;
    priorLogs.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

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
