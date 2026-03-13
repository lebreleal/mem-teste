/**
 * Error Deck Service
 * Manages the special "📕 Caderno de Erros" deck that temporarily holds
 * cards the user got wrong. Cards return to their origin deck when mastered (state=2).
 */

import { supabase } from '@/integrations/supabase/client';

const ERROR_DECK_NAME = '📕 Caderno de Erros';

/** Get or create the error deck for a user */
export async function getOrCreateErrorDeck(userId: string): Promise<string> {
  // Try to find existing error deck by name
  const { data: existing } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('name', ERROR_DECK_NAME)
    .limit(1)
    .single();

  if (existing) return existing.id;

  // Create a new error deck
  const { data: created, error } = await supabase
    .from('decks')
    .insert({
      user_id: userId,
      name: ERROR_DECK_NAME,
      daily_new_limit: 9999,
      daily_review_limit: 9999,
      shuffle_cards: false,
      is_archived: false,
    })
    .select('id')
    .single();

  if (error) throw error;
  return created!.id;
}

/** Get the error deck ID without creating it (returns null if not exists) */
export async function getErrorDeckId(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('decks')
    .select('id')
    .eq('user_id', userId)
    .eq('name', ERROR_DECK_NAME)
    .limit(1)
    .single();
  return data?.id ?? null;
}

export interface ErrorDeckCard {
  id: string;
  front_content: string;
  back_content: string;
  card_type: string;
  state: number;
  stability: number;
  difficulty: number;
  scheduled_date: string;
  last_reviewed_at: string | null;
  origin_deck_id: string | null;
  origin_deck_name: string | null;
  deck_id: string;
  created_at: string;
}

/** Get all cards currently in the error deck, with origin deck names */
export async function getErrorDeckCards(userId: string): Promise<ErrorDeckCard[]> {
  const deckId = await getErrorDeckId(userId);
  if (!deckId) return [];

  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, front_content, back_content, card_type, state, stability, difficulty, scheduled_date, last_reviewed_at, origin_deck_id, deck_id, created_at')
    .eq('deck_id', deckId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!cards || cards.length === 0) return [];

  // Fetch origin deck names
  const originIds = [...new Set(cards.map(c => c.origin_deck_id).filter(Boolean))] as string[];
  let deckNameMap = new Map<string, string>();

  if (originIds.length > 0) {
    const { data: decks } = await supabase
      .from('decks')
      .select('id, name')
      .in('id', originIds);
    if (decks) {
      for (const d of decks) deckNameMap.set(d.id, d.name);
    }
  }

  return cards.map(c => ({
    ...c,
    origin_deck_name: c.origin_deck_id ? (deckNameMap.get(c.origin_deck_id) ?? 'Deck removido') : null,
  }));
}

export interface ErrorDeckStats {
  total: number;
  learning: number;     // state 1
  relearning: number;   // state 3
  due: number;          // scheduled_date <= now
  mastered: number;     // state 2 (about to return)
}

/** Get stats for the error deck */
export async function getErrorDeckStats(userId: string): Promise<ErrorDeckStats> {
  const deckId = await getErrorDeckId(userId);
  if (!deckId) return { total: 0, learning: 0, relearning: 0, due: 0, mastered: 0 };

  const { data: cards, error } = await supabase
    .from('cards')
    .select('state, scheduled_date')
    .eq('deck_id', deckId);

  if (error) throw error;
  if (!cards) return { total: 0, learning: 0, relearning: 0, due: 0, mastered: 0 };

  const now = new Date().toISOString();
  return {
    total: cards.length,
    learning: cards.filter(c => c.state === 1).length,
    relearning: cards.filter(c => c.state === 3).length,
    due: cards.filter(c => c.scheduled_date <= now).length,
    mastered: cards.filter(c => c.state === 2).length,
  };
}

/** Get count of cards in error deck */
export async function getErrorDeckCount(userId: string): Promise<number> {
  const deckId = await getErrorDeckId(userId);
  if (!deckId) return 0;

  const { count, error } = await supabase
    .from('cards')
    .select('id', { count: 'exact', head: true })
    .eq('deck_id', deckId);

  if (error) throw error;
  return count ?? 0;
}

/** Force return selected cards to their origin decks */
export async function returnCardsToOrigin(cardIds: string[]): Promise<number> {
  let returned = 0;
  for (const cardId of cardIds) {
    const { data: card } = await supabase
      .from('cards')
      .select('origin_deck_id')
      .eq('id', cardId)
      .single();

    if (card?.origin_deck_id) {
      await supabase
        .from('cards')
        .update({ deck_id: card.origin_deck_id, origin_deck_id: null } as any)
        .eq('id', cardId);
      returned++;
    }
  }
  return returned;
}

/** Delete cards from error deck (permanent) */
export async function deleteErrorCards(cardIds: string[]): Promise<void> {
  const { error } = await supabase
    .from('cards')
    .delete()
    .in('id', cardIds);
  if (error) throw error;
}
