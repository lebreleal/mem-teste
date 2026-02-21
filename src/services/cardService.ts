/**
 * Service layer for individual card CRUD operations.
 */

import { supabase } from '@/integrations/supabase/client';
import { markdownToHtml } from '@/lib/markdownToHtml';
import type { CardRow } from '@/types/deck';
export type { CardRow } from '@/types/deck';

/** Fetch all cards for a deck. */
export async function fetchCards(deckId: string) {
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
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
  const ext = file.name.split('.').pop() || 'png';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('card-images').upload(path, file);
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
  const { data, error } = await supabase
    .from('cards')
    .select('*')
    .in('deck_id', deckIds)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** Fetch aggregated stats for multiple decks in a single efficient query. */
export async function fetchAggregatedStats(deckIds: string[]) {
  const totals = { new_count: 0, learning_count: 0, review_count: 0, reviewed_today: 0, new_reviewed_today: 0, new_graduated_today: 0 };

  // Single query: get all cards across all descendant decks
  const { data: allCards } = await supabase
    .from('cards')
    .select('id, state, scheduled_date')
    .in('deck_id', deckIds);

  if (!allCards || allCards.length === 0) return totals;

  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  for (const c of allCards) {
    if (c.state === 0) totals.new_count++;
    else if (c.state === 1 || c.state === 3) totals.learning_count++;
    else if (c.state === 2 && new Date(c.scheduled_date) <= now) totals.review_count++;
  }

  // Single query: get today's review logs for these cards
  const cardIds = allCards.map(c => c.id);
  const { data: todayLogs } = await supabase
    .from('review_logs')
    .select('card_id')
    .in('card_id', cardIds)
    .gte('reviewed_at', todayStart.toISOString());

  if (!todayLogs || todayLogs.length === 0) return totals;

  const reviewedCardIds = new Set(todayLogs.map(l => l.card_id));

  // Check which reviewed cards had prior reviews (before today)
  const { data: priorLogs } = await supabase
    .from('review_logs')
    .select('card_id')
    .in('card_id', [...reviewedCardIds])
    .lt('reviewed_at', todayStart.toISOString())
    .limit(1000);

  const hadPriorReview = new Set((priorLogs ?? []).map(l => l.card_id));

  for (const cardId of reviewedCardIds) {
    if (!hadPriorReview.has(cardId)) {
      // New card studied today
      totals.new_reviewed_today++;
      const card = allCards.find(c => c.id === cardId);
      if (card && card.state === 2) totals.new_graduated_today++;
    } else {
      // Review card: count if it's state=2 and scheduled in future (already reviewed)
      const card = allCards.find(c => c.id === cardId);
      if (card && card.state === 2 && new Date(card.scheduled_date) > now) {
        totals.reviewed_today++;
      }
    }
  }

  return totals;
}
