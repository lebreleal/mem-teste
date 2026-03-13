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

  // Scope: current deck + all descendants (hierarchical decks)
  const { data: userDecks, error: userDecksError } = await supabase
    .from('decks')
    .select('id, parent_deck_id')
    .eq('user_id', userId)
    .eq('is_archived', false);

  if (userDecksError) throw userDecksError;

  const deckScopeSet = new Set<string>([originDeckId]);
  const queue = [originDeckId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = (userDecks ?? []).filter(d => d.parent_deck_id === current);
    for (const child of children) {
      if (!deckScopeSet.has(child.id)) {
        deckScopeSet.add(child.id);
        queue.push(child.id);
      }
    }
  }
  const deckScopeIds = [...deckScopeSet];

  /** Max cards to move per concept-error event (safety cap) */
  const MAX_CARDS_PER_EVENT = 30;

  const cardIdsToMove = new Set<string>();

  // Strategy 1: deck_concepts -> concept_cards (scoped to deck hierarchy)
  const { data: deckConcepts } = await supabase
    .from('deck_concepts')
    .select('id, name')
    .eq('user_id', userId)
    .in('deck_id', deckScopeIds);

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

  // Strategy 2: global_concepts.concept_tag_id -> card_tags (only if Strategy 1 found nothing)
  if (cardIdsToMove.size === 0) {
    const { data: globalConcepts } = await supabase
      .from('global_concepts' as any)
      .select('name, slug, concept_tag_id')
      .eq('user_id', userId);

    const conceptTagIds = (globalConcepts ?? [])
      .filter((gc: any) => normalizedTerms.has(normalize(gc.name ?? '')) || normalizedTerms.has(normalize(gc.slug ?? '')))
      .map((gc: any) => gc.concept_tag_id)
      .filter(Boolean);

    if (conceptTagIds.length > 0) {
      // Get card_ids from card_tags, but only for cards in our deck scope
      const { data: scopedCards } = await supabase
        .from('cards')
        .select('id')
        .in('deck_id', deckScopeIds)
        .is('origin_deck_id', null)
        .neq('deck_id', errorDeckId)
        .limit(500);

      if (scopedCards && scopedCards.length > 0) {
        const scopedCardIds = scopedCards.map(c => c.id);
        const { data: cardTags } = await supabase
          .from('card_tags')
          .select('card_id')
          .in('tag_id', [...new Set(conceptTagIds)] as string[])
          .in('card_id', scopedCardIds);

        for (const ct of cardTags ?? []) {
          cardIdsToMove.add(ct.card_id);
        }
      }
    }
  }

  // Strategy 3 (text fallback) REMOVED — too aggressive, caused mass migrations.

  if (cardIdsToMove.size === 0) {
    console.warn('[ErrorDeck] No cards found for concepts:', terms, 'in deck scope:', deckScopeIds);
    return 0;
  }

  // Keep only cards in deck scope, not yet moved, capped for safety.
  const candidateIds = [...cardIdsToMove].slice(0, 200);
  
  // Batch the .in() query to avoid Supabase limits
  const allCandidateCards: { id: string; deck_id: string }[] = [];
  for (let i = 0; i < candidateIds.length; i += 80) {
    const batch = candidateIds.slice(i, i + 80);
    const { data, error: bErr } = await supabase
      .from('cards')
      .select('id, deck_id')
      .in('id', batch)
      .in('deck_id', deckScopeIds)
      .is('origin_deck_id', null)
      .neq('deck_id', errorDeckId);
    if (bErr) throw bErr;
    if (data) allCandidateCards.push(...data);
  }

  const candidateCards = allCandidateCards.slice(0, MAX_CARDS_PER_EVENT);

  if (candidateCards.length === 0) {
    console.warn('[ErrorDeck] Candidates found by concept, but none eligible to move in current scope.');
    return 0;
  }

  console.log(`[ErrorDeck] Found ${cardIdsToMove.size} candidate card IDs, ${candidateCards.length} eligible (capped at ${MAX_CARDS_PER_EVENT})`);

  // Preserve each card's real source deck for accurate return after mastery.
  const bySourceDeck = new Map<string, string[]>();
  for (const card of candidateCards) {
    const arr = bySourceDeck.get(card.deck_id) ?? [];
    arr.push(card.id);
    bySourceDeck.set(card.deck_id, arr);
  }

  const updates = await Promise.all(
    [...bySourceDeck.entries()].map(async ([sourceDeckId, ids]) => {
      const { data, error } = await supabase
        .from('cards')
        .update({ deck_id: errorDeckId, origin_deck_id: sourceDeckId } as any)
        .in('id', ids)
        .eq('deck_id', sourceDeckId)
        .is('origin_deck_id', null)
        .select('id');

      if (error) throw error;
      return data?.length ?? 0;
    })
  );

  const movedCount = updates.reduce((sum, n) => sum + n, 0);
  console.log('[ErrorDeck] Moved', movedCount, 'cards to error deck from', bySourceDeck.size, 'source decks');
  return movedCount;
}
