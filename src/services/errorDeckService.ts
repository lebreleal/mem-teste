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

/**
 * Move existing cards linked to wrong concepts to the error deck.
 * Prioritizes direct concept mappings and falls back to text match inside the
 * origin deck to keep scope focused on the specific errored context.
 * Returns the number of cards moved.
 */
export async function moveConceptCardsToErrorDeck(
  userId: string,
  conceptNames: string[],
  originDeckId: string,
): Promise<number> {
  if (!conceptNames || conceptNames.length === 0) return 0;

  const errorDeckId = await getOrCreateErrorDeck(userId);
  const normalize = (v: string) => v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleanTerm = (v: string) => v.replace(/[%,_]/g, '').trim();

  const terms = [...new Set(conceptNames.map(c => c.trim()).filter(Boolean))];
  if (terms.length === 0) return 0;

  const normalizedTerms = new Set(terms.map(normalize));
  const cardIdsToMove = new Set<string>();

  // Strategy 1: deck_concepts -> concept_cards (search ALL user concepts, not just originDeckId)
  const { data: deckConcepts } = await supabase
    .from('deck_concepts')
    .select('id, name')
    .eq('user_id', userId);

  const matchedConceptIds = (deckConcepts ?? [])
    .filter(dc => normalizedTerms.has(normalize(dc.name)))
    .map(dc => dc.id);

  if (matchedConceptIds.length > 0) {
    for (let i = 0; i < matchedConceptIds.length; i += 50) {
      const batch = matchedConceptIds.slice(i, i + 50);
      const { data: conceptCards } = await supabase
        .from('concept_cards' as any)
        .select('card_id')
        .in('concept_id', batch);

      for (const cc of (conceptCards ?? []) as any[]) {
        cardIdsToMove.add(cc.card_id);
      }
    }
  }

  // Strategy 2: global_concepts -> card_tags (concept slug matches tag slug)
  if (cardIdsToMove.size === 0) {
    const slugs = terms.map(t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''));
    const { data: tags } = await supabase
      .from('tags')
      .select('id')
      .in('slug', slugs);

    if (tags && tags.length > 0) {
      const tagIds = tags.map(t => t.id);
      const { data: cardTags } = await supabase
        .from('card_tags')
        .select('card_id')
        .in('tag_id', tagIds);

      for (const ct of cardTags ?? []) {
        cardIdsToMove.add(ct.card_id);
      }
    }
  }

  // Strategy 3: fallback text match on cards from the origin deck
  if (cardIdsToMove.size === 0) {
    const keywordParts = terms
      .flatMap(term => term.split(/\s+/))
      .map(cleanTerm)
      .filter(w => w.length >= 4);

    const searchable = [...new Set([...terms.map(cleanTerm), ...keywordParts])].slice(0, 10);

    if (searchable.length > 0) {
      const orExpr = searchable
        .flatMap(term => [
          `front_content.ilike.%${term}%`,
          `back_content.ilike.%${term}%`,
        ])
        .join(',');

      const { data: matchedCards } = await supabase
        .from('cards')
        .select('id')
        .eq('deck_id', originDeckId)
        .is('origin_deck_id', null)
        .neq('deck_id', errorDeckId)
        .or(orExpr)
        .limit(120);

      for (const card of matchedCards ?? []) {
        cardIdsToMove.add(card.id);
      }
    }
  }

  if (cardIdsToMove.size === 0) return 0;

  const ids = [...cardIdsToMove];
  const { data: movedRows, error } = await supabase
    .from('cards')
    .update({ deck_id: errorDeckId, origin_deck_id: originDeckId } as any)
    .in('id', ids)
    .eq('deck_id', originDeckId)
    .is('origin_deck_id', null)
    .select('id');

  if (error) throw error;
  return movedRows?.length ?? 0;
}
