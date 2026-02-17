/**
 * Service layer for individual card CRUD operations.
 */

import { supabase } from '@/integrations/supabase/client';
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

/** Create multiple cards at once (batch insert). */
export async function createCards(deckId: string, cards: { frontContent: string; backContent: string; cardType: string }[]) {
  const rows = cards.map(c => ({
    deck_id: deckId,
    front_content: c.frontContent,
    back_content: c.backContent,
    card_type: c.cardType,
  }));
  const { data, error } = await supabase.from('cards').insert(rows).select();
  if (error) throw error;
  return data;
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

/** Fetch aggregated stats for multiple decks. */
export async function fetchAggregatedStats(deckIds: string[]) {
  const totals = { new_count: 0, learning_count: 0, review_count: 0, reviewed_today: 0, new_reviewed_today: 0, new_graduated_today: 0 };
  for (const id of deckIds) {
    const { data } = await supabase.rpc('get_deck_stats', { p_deck_id: id });
    const s = data?.[0];
    if (s) {
      totals.new_count += Number(s.new_count);
      totals.learning_count += Number(s.learning_count);
      totals.review_count += Number(s.review_count);
      totals.reviewed_today += Number(s.reviewed_today ?? 0);
      totals.new_reviewed_today += Number((s as any).new_reviewed_today ?? 0);
      totals.new_graduated_today += Number((s as any).new_graduated_today ?? 0);
    }
  }
  return totals;
}
